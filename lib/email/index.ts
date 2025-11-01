/**
 * Email Module
 * 
 * Provides email template system with rendering, caching, and validation.
 */

// Template Engine
export {
  ITemplateEngine,
  TemplateEngine,
  TemplateFiles,
  RenderedTemplate,
  createTemplateEngine,
} from './template-engine.ts';

// Template Service
export {
  ITemplateService,
  TemplateService,
  createTemplateService,
  createTemplateServiceWithDefaults,
} from './template-service.ts';

// Re-export domain types for convenience
export {
  EmailTemplateConfig,
  EmailTemplateContext,
  EmailTemplateVariable,
} from '../domain/types/email.ts';

// Re-export domain errors for convenience
export {
  EmailTemplateError,
  EmailTemplateNotFoundError,
  EmailTemplateRenderingError,
} from '../domain/errors/email-errors.ts';