# Changelog

All notable changes to SimplyCaster will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Clean Architecture implementation with service layer
- Dependency injection container for better testability
- JWT-based authentication with HTTP-only cookies
- Role-based access control (Admin, Host, Guest)
- RESTful API endpoints for user and room management
- Authentication middleware for secure route protection
- Comprehensive error handling with standardized responses
- API client utility for consistent frontend-backend communication
- User management use cases (Create, Authenticate, Update)
- Room management use cases (Create, Start Recording, Invite Guest)
- PostgreSQL database schema with Row-Level Security (RLS)
- Drizzle ORM integration for type-safe database operations
- Interactive login form with proper error handling
- Docker configuration for easy deployment
- Comprehensive documentation and contribution guidelines
- MIT License for open-source distribution

### Changed
- Refactored authentication to use service layer architecture
- Updated route handlers to use use cases instead of direct database calls
- Improved error handling across the application
- Enhanced security with proper password hashing and JWT management

### Technical Improvements
- Implemented Clean Architecture principles
- Added comprehensive TypeScript types throughout
- Created reusable API client for frontend components
- Established consistent coding standards and patterns
- Added proper separation of concerns between layers

## [0.1.0] - Initial Release

### Added
- Basic Fresh framework setup
- Initial project structure
- Basic routing and components
- Theme toggle functionality
- Responsive design with Tailwind CSS

---

## Release Notes

### Version 0.1.0 (WIP)

**🏗️ Clean Architecture**
- Service layer with dependency injection
- Use cases for business logic
- Repository pattern for data access
- Clear separation of concerns

**🔐 Enhanced Security**
- JWT-based authentication
- Role-based access control
- Password hashing with salt and pepper
- Row-Level Security in database

**🚀 Improved Developer Experience**
- Comprehensive TypeScript support
- Standardized error handling
- API client utilities
- Docker deployment support

**📚 Documentation**
- Complete API documentation
- Contributing guidelines
- Architecture decision records
- Deployment guides

This release establishes SimplyCaster as a production-ready, self-hosted podcast recording platform with enterprise-grade architecture and security.