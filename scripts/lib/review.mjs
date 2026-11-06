import { validateMarkdownEnvelope } from "./markdown.mjs";
import { validateReaderStateSchema, validateReviewJobSchema } from "./schemas.mjs";

function reviewError(instancePath, keyword, message) {
  return { instancePath, keyword, message, params: {} };
}

function objectArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function duplicateErrors(items, key, path, keyword, errors) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const value = item?.[key];
    if (seen.has(value)) {
      errors.push(reviewError(`${path}/${index}/${key}`, keyword, `duplicate ${key}: ${value}`));
    }
    seen.add(value);
  }
}

function structureErrors(job) {
  const errors = [];
  const files = objectArray(job?.files);
  const chunks = objectArray(job?.chunks);
  const volumes = objectArray(job?.volumes);
  duplicateErrors(files, "path", "/files", "review-source", errors);
  duplicateErrors(chunks, "chunk_id", "/chunks", "review-chunk", errors);
  duplicateErrors(chunks, "sequence", "/chunks", "review-sequence", errors);
  duplicateErrors(volumes, "volume_id", "/volumes", "review-volume", errors);

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const volumesById = new Map(volumes.map((volume) => [volume.volume_id, volume]));

  for (const [chunkIndex, chunk] of chunks.entries()) {
    if (chunk.status === "complete" && !chunk.report) {
      errors.push(
        reviewError(
          `/chunks/${chunkIndex}/report`,
          "review-report",
          "a completed chunk requires its report",
        ),
      );
    }
    for (const [sourceIndex, source] of objectArray(chunk.sources).entries()) {
      const file = filesByPath.get(source.path);
      const sourcePath = `/chunks/${chunkIndex}/sources/${sourceIndex}`;
      if (!file || file.sha256 !== source.sha256) {
        errors.push(
          reviewError(
            `${sourcePath}/sha256`,
            "review-source",
            "chunk source must match a declared scope path and hash",
          ),
        );
      }
      if (
        source.line_end < source.line_start ||
        (file && source.line_end > file.line_count)
      ) {
        errors.push(
          reviewError(
            `${sourcePath}/line_end`,
            "review-range",
            "chunk source lines must be a valid range inside the scope file",
          ),
        );
      }
    }
  }

  for (const [volumeIndex, volume] of volumes.entries()) {
    if (volume.status === "complete" && !volume.report) {
      errors.push(
        reviewError(
          `/volumes/${volumeIndex}/report`,
          "review-report",
          "a completed volume synthesis requires its report",
        ),
      );
    }
    for (const [chunkIndex, chunkId] of (Array.isArray(volume.chunk_ids) ? volume.chunk_ids : []).entries()) {
      const chunk = chunksById.get(chunkId);
      if (!chunk) {
        errors.push(
          reviewError(
            `/volumes/${volumeIndex}/chunk_ids/${chunkIndex}`,
            "review-synthesis",
            "volume synthesis references an unknown chunk",
          ),
        );
      } else if (volume.status === "complete" && chunk.status !== "complete") {
        errors.push(
          reviewError(
            `/volumes/${volumeIndex}/status`,
            "review-synthesis",
            "a completed volume cannot synthesize an incomplete chunk",
          ),
        );
      }
    }
  }

  if (job?.book?.status === "complete" && !job.book.report) {
    errors.push(
      reviewError("/book/report", "review-report", "a completed book synthesis requires its report"),
    );
  }
  const bookVolumeIds = Array.isArray(job?.book?.volume_ids) ? job.book.volume_ids : [];
  for (const [volumeIndex, volumeId] of bookVolumeIds.entries()) {
    const volume = volumesById.get(volumeId);
    if (!volume) {
      errors.push(
        reviewError(
          `/book/volume_ids/${volumeIndex}`,
          "review-synthesis",
          "book synthesis references an unknown volume",
        ),
      );
    } else if (job.book.status === "complete" && volume.status !== "complete") {
      errors.push(
        reviewError(
          "/book/status",
          "review-synthesis",
          "a completed book cannot synthesize an incomplete volume",
        ),
      );
    }
  }

  if (job?.perspective === "fresh") {
    const fileIndexes = new Map(files.map((file, index) => [file.path, index]));
    let previousFileIndex = -1;
    let previousLineEnd = 0;
    for (const [index, chunk] of chunks.entries()) {
      if (chunk.sequence !== index + 1) {
        errors.push(
          reviewError(
            `/chunks/${index}/sequence`,
            "review-sequence",
            "fresh review chunks must use continuous sequence numbers starting at 1",
          ),
        );
      }
      for (const [sourceIndex, source] of objectArray(chunk.sources).entries()) {
        const fileIndex = fileIndexes.get(source.path);
        if (fileIndex === undefined) continue;
        if (
          fileIndex < previousFileIndex ||
          (fileIndex === previousFileIndex && source.line_start <= previousLineEnd)
        ) {
          errors.push(
            reviewError(
              `/chunks/${index}/sources/${sourceIndex}/line_start`,
              "review-order",
              "fresh review sources must follow job.files order and increasing, non-overlapping line ranges",
            ),
          );
        }
        previousFileIndex = fileIndex;
        previousLineEnd = source.line_end;
      }
    }

    const firstIncompleteIndex = chunks.findIndex(
      (chunk) => chunk.status !== "complete" || !chunk.report,
    );
    const expectedNextChunkId =
      firstIncompleteIndex === -1 ? null : chunks[firstIncompleteIndex].chunk_id;
    if (job.next_chunk_id !== expectedNextChunkId) {
      errors.push(
        reviewError(
          "/next_chunk_id",
          "review-resume",
          "next chunk must be the first incomplete fresh review chunk",
        ),
      );
    }
    if (firstIncompleteIndex !== -1) {
      for (let index = firstIncompleteIndex + 1; index < chunks.length; index += 1) {
        if (chunks[index].status === "complete") {
          errors.push(
            reviewError(
              `/chunks/${index}/status`,
              "review-progress",
              "fresh review chunks must be completed in declared order",
            ),
          );
        }
      }
    }
  }

  if (job?.next_chunk_id) {
    const next = chunksById.get(job.next_chunk_id);
    if (!next || next.status === "complete") {
      errors.push(
        reviewError(
          "/next_chunk_id",
          "review-resume",
          "next chunk must reference an incomplete declared chunk",
        ),
      );
    }
  }
  if (job?.status === "complete" && job.next_chunk_id !== null) {
    errors.push(
      reviewError(
        "/next_chunk_id",
        "review-resume",
        "a completed review cannot name a next chunk",
      ),
    );
  }

  return errors;
}

function rangesCoverFile(ranges, lineCount) {
  const sorted = ranges
    .filter(
      (range) =>
        range.line_start >= 1 &&
        range.line_end >= range.line_start &&
        range.line_end <= lineCount,
    )
    .sort((left, right) => left.line_start - right.line_start || left.line_end - right.line_end);
  let nextLine = 1;
  for (const range of sorted) {
    if (range.line_start !== nextLine) return false;
    nextLine = range.line_end + 1;
  }
  return nextLine === lineCount + 1;
}

export function checkReviewCoverage(job) {
  const files = objectArray(job?.files);
  const chunks = objectArray(job?.chunks);
  const volumes = objectArray(job?.volumes);
  const completedChunks = chunks.filter((chunk) => chunk.status === "complete" && chunk.report);
  const uncoveredFiles = files
    .filter((file) => {
      const ranges = completedChunks.flatMap((chunk) =>
        objectArray(chunk.sources).filter(
          (source) => source.path === file.path && source.sha256 === file.sha256,
        ),
      );
      return !rangesCoverFile(ranges, file.line_count);
    })
    .map((file) => file.path);
  const incompleteChunks = chunks
    .filter((chunk) => chunk.status !== "complete" || !chunk.report)
    .map((chunk) => chunk.chunk_id);
  const synthesizedChunks = new Set(
    volumes.flatMap((volume) => (Array.isArray(volume.chunk_ids) ? volume.chunk_ids : [])),
  );
  const unsynthesizedChunks = chunks
    .map((chunk) => chunk.chunk_id)
    .filter((chunkId) => !synthesizedChunks.has(chunkId));
  const incompleteVolumes = volumes
    .filter((volume) => volume.status !== "complete" || !volume.report)
    .map((volume) => volume.volume_id);
  const bookVolumeIds = Array.isArray(job?.book?.volume_ids) ? job.book.volume_ids : [];
  const synthesizedVolumes = new Set(bookVolumeIds);
  const unsynthesizedVolumes = volumes
    .map((volume) => volume.volume_id)
    .filter((volumeId) => !synthesizedVolumes.has(volumeId));
  const bookComplete = job?.book?.status === "complete" && Boolean(job.book.report);
  const structureValid = structureErrors(job).length === 0;
  const complete =
    structureValid &&
    files.length > 0 &&
    uncoveredFiles.length === 0 &&
    incompleteChunks.length === 0 &&
    unsynthesizedChunks.length === 0 &&
    incompleteVolumes.length === 0 &&
    unsynthesizedVolumes.length === 0 &&
    bookComplete;

  return {
    coverage: complete ? "full" : "partial",
    complete,
    structure_valid: structureValid,
    uncovered_files: uncoveredFiles,
    incomplete_chunks: incompleteChunks,
    unsynthesized_chunks: unsynthesizedChunks,
    incomplete_volumes: incompleteVolumes,
    unsynthesized_volumes: unsynthesizedVolumes,
    book_complete: bookComplete,
  };
}

export function validateReviewJob(value, options = {}) {
  const result = validateReviewJobSchema(value, options);
  const errors = [...result.errors, ...structureErrors(value)];
  const coverage = checkReviewCoverage(value);
  if (value?.coverage === "full" && !coverage.complete) {
    errors.push(
      reviewError(
        "/coverage",
        "review-completion",
        "full coverage requires completed source ranges and chunk-volume-book synthesis",
      ),
    );
  }
  if (value?.status === "complete" && !coverage.complete) {
    errors.push(
      reviewError(
        "/status",
        "review-completion",
        "a complete review requires completed source ranges and chunk-volume-book synthesis",
      ),
    );
  }
  if (value?.status === "complete" && value.coverage !== "full") {
    errors.push(
      reviewError(
        "/coverage",
        "review-completion",
        "a complete review must record full coverage",
      ),
    );
  }
  if (value?.coverage === "full" && value.status !== "complete") {
    errors.push(
      reviewError(
        "/status",
        "review-completion",
        "full review coverage requires a complete job status",
      ),
    );
  }
  return { ...result, valid: errors.length === 0, errors, coverage };
}

export function validateReaderState(value, options = {}) {
  const result = validateReaderStateSchema(value, options);
  const errors = [...result.errors];
  const chunks = objectArray(value?.chunks);
  duplicateErrors(chunks, "chunk_id", "/chunks", "reader-chunk", errors);
  duplicateErrors(chunks, "sequence", "/chunks", "reader-sequence", errors);

  for (const [chunkIndex, chunk] of chunks.entries()) {
    if (value?.perspective === "fresh" && chunk.sequence !== chunkIndex + 1) {
      errors.push(
        reviewError(
          `/chunks/${chunkIndex}/sequence`,
          "reader-sequence",
          "fresh reader chunks must use continuous sequence numbers starting at 1",
        ),
      );
    }
    for (const [sourceIndex, source] of objectArray(chunk.sources).entries()) {
      if (source.line_end < source.line_start) {
        errors.push(
          reviewError(
            `/chunks/${chunkIndex}/sources/${sourceIndex}/line_end`,
            "reader-range",
            "reader source lines must end after they start",
          ),
        );
      }
    }
  }

  const lastSequence = chunks.reduce((maximum, chunk) => Math.max(maximum, chunk.sequence), 0);
  if (value?.next_sequence !== lastSequence + 1) {
    errors.push(
      reviewError(
        "/next_sequence",
        "reader-sequence",
        "next sequence must follow the last recorded reader chunk",
      ),
    );
  }
  if (value?.status === "complete" && chunks.length === 0) {
    errors.push(
      reviewError(
        "/status",
        "reader-completion",
        "a complete reader state requires at least one recorded chunk",
      ),
    );
  }
  return { ...result, valid: errors.length === 0, errors };
}

export function validateReaderStateForJob(value, job, options = {}) {
  const result = validateReaderState(value, options);
  const errors = [...result.errors];
  for (const field of ["job_id", "scope_id", "perspective"]) {
    if (value?.[field] !== job?.[field]) {
      errors.push(
        reviewError(
          `/${field}`,
          "reader-job-identity",
          `reader state ${field} must match its review job`,
        ),
      );
    }
  }

  const chunks = objectArray(value?.chunks);
  const jobChunks = objectArray(job?.chunks);
  const jobChunksById = new Map(jobChunks.map((chunk) => [chunk.chunk_id, chunk]));
  const fileIndexes = new Map(objectArray(job?.files).map((file, index) => [file.path, index]));
  let previousFileIndex = -1;
  let previousLineEnd = 0;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const jobChunk = jobChunksById.get(chunk.chunk_id);
    const sources = objectArray(chunk.sources);
    if (!jobChunk) {
      errors.push(
        reviewError(
          `/chunks/${chunkIndex}/chunk_id`,
          "reader-job-chunk",
          "reader chunk must reference a chunk declared by its review job",
        ),
      );
    } else {
      if (chunk.report !== jobChunk.report) {
        errors.push(
          reviewError(
            `/chunks/${chunkIndex}/report`,
            "reader-job-report",
            "reader chunk report must match its review job chunk",
          ),
        );
      }
      const jobSources = objectArray(jobChunk.sources);
      if (sources.length !== jobSources.length) {
        errors.push(
          reviewError(
            `/chunks/${chunkIndex}/sources`,
            "reader-job-source",
            "reader chunk must record the same sources as its review job chunk",
          ),
        );
      }
      for (const [sourceIndex, source] of sources.entries()) {
        const jobSource = jobSources[sourceIndex];
        if (
          !jobSource ||
          source.path !== jobSource.path ||
          source.sha256 !== jobSource.sha256 ||
          source.line_start !== jobSource.line_start ||
          source.line_end !== jobSource.line_end
        ) {
          errors.push(
            reviewError(
              `/chunks/${chunkIndex}/sources/${sourceIndex}`,
              "reader-job-source",
              "reader source path, hash, and line range must match its review job chunk",
            ),
          );
        }
      }
    }

    if (job?.perspective === "fresh") {
      const expectedChunk = jobChunks[chunkIndex];
      if (
        !expectedChunk ||
        expectedChunk.chunk_id !== chunk.chunk_id ||
        expectedChunk.sequence !== chunk.sequence
      ) {
        errors.push(
          reviewError(
            `/chunks/${chunkIndex}/chunk_id`,
            "reader-job-chain",
            "fresh reader chunks must form a continuous prefix of the review job chunks",
          ),
        );
      }
      for (const [sourceIndex, source] of sources.entries()) {
        const fileIndex = fileIndexes.get(source.path);
        if (fileIndex === undefined) continue;
        if (
          fileIndex < previousFileIndex ||
          (fileIndex === previousFileIndex && source.line_start <= previousLineEnd)
        ) {
          errors.push(
            reviewError(
              `/chunks/${chunkIndex}/sources/${sourceIndex}/line_start`,
              "reader-job-order",
              "fresh reader sources must follow job.files order and increasing, non-overlapping line ranges",
            ),
          );
        }
        previousFileIndex = fileIndex;
        previousLineEnd = source.line_end;
      }
    }
  }

  if (job?.status === "complete" && job?.perspective === "fresh") {
    if (value?.status !== "complete") {
      errors.push(reviewError(
        "/status",
        "reader-job-chain",
        "a completed fresh review job requires a completed reader state",
      ));
    }
    const expected = jobChunks.map((chunk) => `${chunk.chunk_id}\0${chunk.sequence}`);
    const actual = chunks.map((chunk) => `${chunk.chunk_id}\0${chunk.sequence}`);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(reviewError(
        "/chunks",
        "reader-job-chain",
        "a completed fresh reader state must contain every review-job chunk in the required order",
      ));
    }
  }

  return { ...result, valid: errors.length === 0, errors };
}

export function validateReaderStateMarkdown(markdown, options = {}) {
  return validateMarkdownEnvelope(markdown, validateReaderState, options);
}
