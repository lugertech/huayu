import * as backend from "./backend";
export * from "./backend";
export { validateFile } from "./mentex";
export type {
  ComponentExecutionResult,
  ComponentResultData,
} from "../types/components";
export const AIAPI = {
  instruction: backend.instructionAPI,
  image: backend.imageAPI,
  website: backend.websiteAPI,
  audioGenerate: backend.audioGenerateAPI,
  audioRecognize: backend.audioRecognizeAPI,
  documentUpload: backend.documentUploadAPI,
  documentGenerate: backend.documentGenerateAPI,
  uploadFile: backend.uploadFileAPI,
  buildInputs: {
    text: backend.buildTextInput,
    image: backend.buildImageInput,
    speech: backend.buildSpeechInput,
    website: backend.buildWebsiteInput,
    file: backend.buildFileInput,
    combine: backend.combineInputs,
  },
  utils: {
    isSuccess: backend.isAPISuccess,
    extractData: backend.extractAPIData,
    handleError: backend.handleAPIError,
  },
};
