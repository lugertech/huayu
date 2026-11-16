import type { MessageKey, Values } from "@/i18n";
import type { ErrorTranslation } from "@/i18n/errors";

// Error identifiers belong to the API contract; wording belongs to the locale catalogs.
export const apiErrorTranslations: Record<
  string,
  { key: MessageKey; values?: Values }
> = {
  INVALID_NAME: { key: "api.errors.invalidName", values: { min: 1, max: 120 } },
  INVALID_DOCUMENT: { key: "canvas.invalidCanvasData" },
  NOT_FOUND: { key: "api.errors.contentNotFound" },
  SERVER_ERROR: { key: "common.operationFailedLater" },
  INVALID_REQUEST: { key: "api.errors.invalidRequestData" },
  COLLABORATION_CLOSED: { key: "canvas.share.linkUnavailable" },
  COLLABORATOR_REMOVED: { key: "collaboration.apiRemoved" },
  SHARED_RESOURCE_FORBIDDEN: { key: "canvas.access.currentAssetsOnly" },
  ROOM_FULL: { key: "api.errors.roomFull", values: { max: 15 } },
  SHARED_SCOPE_FORBIDDEN: { key: "canvas.access.currentCanvasOnly" },
  WORKSPACE_PRIVATE: { key: "canvas.access.privateMessage" },
  INVALID_HOST: { key: "api.errors.thisHostIsNotAllowed" },
  INVALID_ORIGIN: { key: "api.errors.thisRequestOriginIsNotAllowed" },
  MEDIA_FILE_REQUIRED: { key: "api.errors.chooseAVideoOrAudioFile" },
  COVER_DECODER_UNAVAILABLE: { key: "api.errors.coverDecoderUnavailable" },
  AUDIO_DECODER_UNAVAILABLE: {
    key: "api.errors.localAudioDecodingIsUnavailable",
  },
  MEDIA_BUSY: { key: "api.errors.anotherRecordingIsBeingProcessed" },
  MEDIA_TIMEOUT: { key: "api.errors.audioDecodingTimedOut" },
  COVER_TIMEOUT: { key: "api.errors.coverTimedOut" },
  AUDIO_UNREADABLE: { key: "api.errors.cannotReadThisRecordingsAudio" },
  RECORDING_COVER_UNAVAILABLE: { key: "api.errors.recordingCoverUnavailable" },
  INVALID_AUDIO_RANGE: { key: "api.errors.invalidAudioSegmentRange" },
  NO_AUDIO_TRACK: { key: "api.errors.theRecordingHasNoReadableAudioTrack" },
  INVALID_RECORDING_DURATION: { key: "api.errors.invalidRecordingDuration" },
  ANALYSIS_TOO_LONG: { key: "api.errors.analysisTextIsTooLong" },
  IMAGE_ASSET_REQUIRED: { key: "assets.imageRequired" },
  INVALID_UPLOAD: { key: "api.errors.invalidFileUploadData" },
  INVALID_FILENAME: { key: "api.errors.invalidFilename", values: { max: 240 } },
  UPLOAD_INTERRUPTED: { key: "api.errors.uploadInterrupted" },
  DOCUMENT_UPLOAD_TOO_LARGE: {
    key: "api.errors.documentUploadTooLarge",
    values: { maxMb: 10 },
  },
  FILE_TOO_LARGE: { key: "api.errors.fileTooLarge", values: { maxMb: 512 } },
  UPLOAD_REQUIRED: { key: "api.errors.chooseAFileToUpload" },
  PDF_TEXT_UNREADABLE: { key: "api.errors.cannotExtractPdfText" },
  INVALID_DOCX: { key: "api.errors.invalidDocxFormat" },
  DOCX_BODY_TOO_LARGE: { key: "api.errors.theDocxDocumentBodyIsTooLarge" },
  WORKBOOK_UNREADABLE: { key: "api.errors.cannotReadWorkbook" },
  WORKBOOK_TEXT_TOO_LARGE: { key: "api.errors.theWorkbookContainsTooMuchText" },
  TEXT_NOT_UTF8: { key: "api.errors.textFilesMustUseUtf8Encoding" },
  UNSUPPORTED_DOCUMENT_FORMAT: {
    key: "api.errors.thisFileFormatCannotBeParsed",
  },
  DOCUMENT_TEXT_TOO_LARGE: { key: "api.errors.theDocumentContainsTooMuchText" },
  DOCUMENT_CONTENT_TOO_LARGE: { key: "api.errors.documentContentTooLarge" },
  DOCUMENT_PARSER_UNAVAILABLE: { key: "api.errors.documentParserUnavailable" },
  DOCUMENT_PARSE_TIMEOUT: { key: "api.errors.documentParseTimeout" },
  INVALID_WEB_URL: { key: "api.errors.invalidWebAddress" },
  UNSUPPORTED_WEB_URL: {
    key: "api.errors.useAnHttpOrHttpsWebAddressWithoutCredentials",
  },
  WEB_HOST_MISSING: { key: "api.errors.theWebAddressIsMissingADomain" },
  INVALID_WEB_PORT: { key: "api.errors.invalidWebPort" },
  WEB_DNS_FAILED: { key: "api.errors.cannotResolveTheDomain" },
  WEB_ADDRESS_FORBIDDEN: {
    key: "api.errors.thisAddressCannotBeReadAsAnExternalPage",
  },
  WEB_FETCH_FAILED: { key: "api.errors.cannotReadThePage" },
  INVALID_WEB_REDIRECT: { key: "api.errors.invalidRedirectUrl" },
  WEB_RESPONSE_UNREADABLE: {
    key: "api.errors.thePageReturnedNoReadableContent",
  },
  WEB_READ_INTERRUPTED: { key: "api.errors.pageLoadingInterrupted" },
  WEB_PAGE_TOO_LARGE: { key: "api.errors.thePageIsTooLarge" },
  TOO_MANY_WEB_REDIRECTS: { key: "api.errors.tooManyPageRedirects" },
  LOCAL_COVER_REQUIRED: { key: "api.errors.useALocalImageForTheCover" },
  STALE_PREVIEW: { key: "api.errors.stalePreview" },
  CANVAS_TOO_LARGE: { key: "api.errors.canvasDataIsTooLarge" },
  TEMPLATE_METADATA_TOO_LONG: {
    key: "api.errors.theExampleDescriptionOrTagsAreTooLong",
  },
  BUILTIN_TEMPLATE_READ_ONLY: {
    key: "api.errors.builtInExamplesCannotBeDeleted",
  },
  COLLABORATION_NOT_OPEN: { key: "collaboration.apiNotOpen" },
  METHOD_NOT_ALLOWED: { key: "api.errors.methodNotAllowed" },
  REQUEST_TOO_LARGE: { key: "api.errors.requestTooLarge" },
  UNSUPPORTED_MEDIA_TYPE: { key: "api.errors.unsupportedMediaType" },
};

/** Validates the error response once, before passing typed translations to the UI. */
export function readApiError(value: unknown): {
  code: string;
  message: string | ErrorTranslation;
} {
  const error =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const code =
    typeof error.code === "string" && error.code
      ? error.code
      : "REQUEST_FAILED";
  if (Object.hasOwn(apiErrorTranslations, code)) {
    const definition = apiErrorTranslations[code];
    const values: Values = { ...definition.values };
    if (
      error.params &&
      typeof error.params === "object" &&
      !Array.isArray(error.params)
    ) {
      for (const [name, value] of Object.entries(error.params)) {
        if (
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value))
        ) {
          values[name] = value;
        }
      }
    }
    return { code, message: { key: definition.key, values } };
  }
  return {
    code,
    message:
      typeof error.message === "string" && error.message
        ? error.message
        : { key: "common.operationFailedRetry" },
  };
}
