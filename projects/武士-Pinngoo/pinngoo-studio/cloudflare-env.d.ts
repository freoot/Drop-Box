declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_TEXT_MODEL?: string;
    AI_API_BASE_URL?: string;
    AI_TEXT_API?: string;
    AI_IMAGE_MODEL?: string;
    AI_IMAGE_API_KEY?: string;
    AI_IMAGE_API_BASE_URL?: string;
  }
}
