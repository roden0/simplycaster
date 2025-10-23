// ============================================================================
// Server-Side Validation Examples
// SimplyCaster Centralized Form Validation System
// ============================================================================

import { define } from "../../../utils.ts";
import { 
  validateJSON, 
  validateMultipartData,
  validateAPIRequest,
  validateFileUploads,
  createAPISuccessResponse,
  createAPIErrorResponse,
  audioFileValidation,
  type ValidatedRequest
} from "../index.ts";
import { userRegistrationSchema, episodeUploadSchema } from "../schemas.ts";
import { requireAuth, requireRole } from "../../middleware/auth.ts";

// ============================================================================
// Example 1: JSON Validation Middleware
// ============================================================================

/**
 * Example API route using JSON validation middleware
 * POST /api/users/register
 */
export const userRegistrationHandler = define.handlers({
  POST: validateJSON(userRegistrationSchema)(
    async (req: ValidatedRequest<any>) => {
      try {
        // Access validated data directly from req.validatedData
        const { email, password, fullName } = req.validatedData;
        
        // Simulate user creation logic
        const newUser = {
          id: crypto.randomUUID(),
          email,
          fullName,
          role: 'host',
          createdAt: new Date().toISOString()
        };

        return createAPISuccessResponse(
          { user: newUser },
          "User registered successfully",
          201
        );

      } catch (error) {
        console.error("User registration error:", error);
        
        return createAPIErrorResponse(
          [{
            field: "",
            code: "REGISTRATION_ERROR",
            message: "Failed to register user",
            params: {}
          }],
          "Registration failed",
          500
        );
      }
    }
  )
});

// ============================================================================
// Example 2: Multipart Data Validation (File Upload)
// ============================================================================

/**
 * Example API route using multipart validation middleware
 * POST /api/episodes/upload
 */
export const episodeUploadHandler = define.handlers({
  POST: requireAuth(
    validateMultipartData(episodeUploadSchema)(
      async (req: ValidatedRequest<any>, user) => {
        try {
          // Access validated data including files
          const { title, description, file, episodeNumber } = req.validatedData;
          
          // Additional file validation
          const fileValidation = await validateFileUploads(
            req,
            ['file'],
            audioFileValidation
          );

          if (!fileValidation.success) {
            return createAPIErrorResponse(
              fileValidation.errors,
              "File validation failed"
            );
          }

          // Simulate episode creation logic
          const newEpisode = {
            id: crypto.randomUUID(),
            title,
            description,
            episodeNumber,
            fileName: file.name,
            fileSize: file.size,
            uploadedBy: user.id,
            createdAt: new Date().toISOString()
          };

          return createAPISuccessResponse(
            { episode: newEpisode },
            "Episode uploaded successfully",
            201
          );

        } catch (error) {
          console.error("Episode upload error:", error);
          
          return createAPIErrorResponse(
            [{
              field: "",
              code: "UPLOAD_ERROR",
              message: "Failed to upload episode",
              params: {}
            }],
            "Upload failed",
            500
          );
        }
      }
    )
  )
});

// ============================================================================
// Example 3: Manual Validation with API Utils
// ============================================================================

/**
 * Example API route using manual validation
 * PUT /api/users/{id}/profile
 */
export const updateUserProfileHandler = define.handlers({
  PUT: requireAuth(async (req, user) => {
    try {
      // Manual validation using API utilities
      const validationResult = await validateAPIRequest(
        req,
        {
          fields: {
            fullName: {
              validators: [
                { type: 'required' },
                { type: 'minLength', params: { min: 2 } },
                { type: 'maxLength', params: { max: 50 } }
              ]
            },
            email: {
              validators: [
                { type: 'required' },
                { type: 'email' }
              ]
            },
            bio: {
              validators: [
                { type: 'maxLength', params: { max: 500 } }
              ]
            }
          },
          options: {
            stripUnknown: true
          }
        },
        {
          sanitize: true,
          stripUnknown: true
        }
      );

      if (!validationResult.success) {
        return createAPIErrorResponse(
          validationResult.errors,
          "Profile validation failed"
        );
      }

      const { fullName, email, bio } = validationResult.data!;

      // Simulate profile update logic
      const updatedProfile = {
        id: user.id,
        fullName,
        email,
        bio,
        updatedAt: new Date().toISOString()
      };

      return createAPISuccessResponse(
        { profile: updatedProfile },
        "Profile updated successfully"
      );

    } catch (error) {
      console.error("Profile update error:", error);
      
      return createAPIErrorResponse(
        [{
          field: "",
          code: "UPDATE_ERROR",
          message: "Failed to update profile",
          params: {}
        }],
        "Update failed",
        500
      );
    }
  })
});

// ============================================================================
// Example 4: Custom Error Formatting
// ============================================================================

/**
 * Example with custom error formatting
 * POST /api/rooms/create
 */
export const createRoomHandler = define.handlers({
  POST: requireRole(['host', 'admin'])(
    validateJSON(
      {
        fields: {
          name: {
            validators: [
              { type: 'required' },
              { type: 'minLength', params: { min: 3 } },
              { type: 'maxLength', params: { max: 100 } }
            ]
          },
          slug: {
            validators: [
              { type: 'pattern', params: { pattern: '^[a-z0-9-]+$' } }
            ]
          },
          maxParticipants: {
            validators: [
              { type: 'min', params: { min: 1 } },
              { type: 'max', params: { max: 50 } }
            ]
          }
        }
      },
      {
        // Custom error formatter
        errorFormatter: (errors) => ({
          success: false,
          message: "Room creation failed",
          validationErrors: errors.map(error => ({
            field: error.field,
            issue: error.message,
            errorCode: error.code
          }))
        })
      }
    )(
      async (req: ValidatedRequest<any>, user) => {
        try {
          const { name, slug, maxParticipants } = req.validatedData;
          
          // Simulate room creation logic
          const newRoom = {
            id: crypto.randomUUID(),
            name,
            slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
            maxParticipants: maxParticipants || 10,
            hostId: user.id,
            status: 'waiting',
            createdAt: new Date().toISOString()
          };

          return createAPISuccessResponse(
            { room: newRoom },
            "Room created successfully",
            201
          );

        } catch (error) {
          console.error("Room creation error:", error);
          
          return createAPIErrorResponse(
            [{
              field: "",
              code: "CREATION_ERROR",
              message: "Failed to create room",
              params: {}
            }],
            "Creation failed",
            500
          );
        }
      }
    )
  )
});

// ============================================================================
// Example 5: File Upload with Content Validation
// ============================================================================

/**
 * Example with comprehensive file validation
 * POST /api/episodes/upload-with-validation
 */
export const uploadEpisodeWithValidationHandler = define.handlers({
  POST: requireAuth(async (req, user) => {
    try {
      // First validate the multipart form data
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return createAPIErrorResponse(
          [{
            field: "",
            code: "INVALID_CONTENT_TYPE",
            message: "Request must be multipart/form-data",
            params: {}
          }],
          "Invalid content type",
          400
        );
      }

      // Validate files with comprehensive options
      const fileValidation = await validateFileUploads(
        req,
        ['audioFile', 'coverImage'],
        {
          maxSize: 100 * 1024 * 1024, // 100MB
          allowedTypes: ['audio/mpeg', 'audio/ogg', 'audio/webm'],
          allowedExtensions: ['mp3', 'ogg', 'webm'],
          validateContent: true
        }
      );

      if (!fileValidation.success) {
        return createAPIErrorResponse(
          fileValidation.errors,
          "File validation failed"
        );
      }

      // Validate other form fields
      const formValidation = await validateAPIRequest(
        req,
        {
          fields: {
            title: {
              validators: [
                { type: 'required' },
                { type: 'minLength', params: { min: 1 } },
                { type: 'maxLength', params: { max: 255 } }
              ]
            },
            description: {
              validators: [
                { type: 'maxLength', params: { max: 1000 } }
              ]
            }
          }
        },
        {
          sanitize: true,
          stripUnknown: true
        }
      );

      if (!formValidation.success) {
        return createAPIErrorResponse(
          formValidation.errors,
          "Form validation failed"
        );
      }

      const { title, description } = formValidation.data!;
      const { audioFile } = fileValidation.data!;

      // Simulate episode creation with file processing
      const newEpisode = {
        id: crypto.randomUUID(),
        title,
        description,
        audioFile: {
          name: (audioFile as File).name,
          size: (audioFile as File).size,
          type: (audioFile as File).type
        },
        uploadedBy: user.id,
        status: 'processing',
        createdAt: new Date().toISOString()
      };

      return createAPISuccessResponse(
        { episode: newEpisode },
        "Episode upload started successfully",
        202
      );

    } catch (error) {
      console.error("Episode upload error:", error);
      
      return createAPIErrorResponse(
        [{
          field: "",
          code: "UPLOAD_ERROR",
          message: "Failed to process upload",
          params: {}
        }],
        "Upload failed",
        500
      );
    }
  })
});

// ============================================================================
// Usage Examples in Fresh Routes
// ============================================================================

/**
 * Example of how to use these handlers in Fresh routes:
 * 
 * // routes/api/users/register.ts
 * export const handler = userRegistrationHandler;
 * 
 * // routes/api/episodes/upload.ts
 * export const handler = episodeUploadHandler;
 * 
 * // routes/api/users/[id]/profile.ts
 * export const handler = updateUserProfileHandler;
 * 
 * // routes/api/rooms/create.ts
 * export const handler = createRoomHandler;
 * 
 * // routes/api/episodes/upload-advanced.ts
 * export const handler = uploadEpisodeWithValidationHandler;
 */