# Contributing to SimplyCaster

Thank you for your interest in contributing to SimplyCaster! This document provides guidelines and information for contributors.

## 🎯 Mission

SimplyCaster is an open-source podcast recording platform designed to be:
- **Simple**: Easy to use and deploy
- **Secure**: Privacy-focused with self-hosted deployment
- **Accessible**: Available to everyone regardless of technical expertise
- **Community-driven**: Built by and for the podcasting community

## 🤝 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Harassment, trolling, or discriminatory comments
- Publishing others' private information without permission
- Any conduct that could reasonably be considered inappropriate

## 🚀 Getting Started

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/your-username/simplycaster.git
   cd simplycaster
   ```

2. **Set up your development environment:**
   ```bash
   # Install Deno (if not already installed)
   curl -fsSL https://deno.land/install.sh | sh
   
   # Set up environment variables
   cp .env.example .env
   # Edit .env with your local database settings
   ```

3. **Set up the database:**
   ```bash
   # Create local PostgreSQL database
   createdb simplycaster_dev
   
   # Run migrations (when available)
   deno task db:migrate
   ```

4. **Start development server:**
   ```bash
   deno task dev
   ```

### Development Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes following our coding standards**

3. **Test your changes:**
   ```bash
   deno task test
   deno task check
   ```

4. **Commit with a descriptive message:**
   ```bash
   git commit -m "feat: add user profile management"
   ```

5. **Push and create a Pull Request**

## 📝 Coding Standards

### TypeScript Guidelines

- **Use TypeScript**: All code should be written in TypeScript
- **Strict typing**: Avoid `any` types, use proper interfaces and types
- **Naming conventions**:
  - Variables and functions: `camelCase`
  - Classes and interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Files: `kebab-case.ts`

### Architecture Principles

SimplyCaster follows **Clean Architecture** principles:

#### Domain Layer (`/lib/domain/`)
- **Entities**: Core business objects with identity
- **Value Objects**: Immutable objects defined by their values
- **Repository Interfaces**: Abstract data access contracts
- **Domain Services**: Business logic that doesn't belong to entities

```typescript
// Example: Domain Entity
export interface User extends BaseEntity {
  email: string;
  role: UserRole;
  isActive: boolean;
}

// Example: Repository Interface
export interface UserRepository {
  findById(id: string): Promise<Result<User | null>>;
  create(data: CreateUserData): Promise<Result<User>>;
}
```

#### Application Layer (`/lib/application/`)
- **Use Cases**: Business operations and workflows
- **DTOs**: Data transfer objects for input/output
- **Application Services**: Orchestrate domain operations

```typescript
// Example: Use Case
export class CreateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private passwordService: PasswordService
  ) {}

  async execute(input: CreateUserInput): Promise<Result<CreateUserOutput>> {
    // Business logic implementation
  }
}
```

#### Infrastructure Layer (`/lib/infrastructure/`)
- **Repository Implementations**: Concrete data access using Drizzle ORM
- **External Services**: Third-party integrations
- **Technical Services**: JWT, password hashing, file storage

#### Presentation Layer (`/routes/`, `/components/`, `/islands/`)
- **Routes**: API endpoints and page handlers
- **Components**: Server-side rendered UI components
- **Islands**: Client-side interactive components

### Code Quality

- **Error Handling**: Use the `Result<T, E>` pattern for consistent error handling
- **Validation**: Validate input at boundaries (routes, use cases)
- **Testing**: Write tests for business logic and critical paths
- **Documentation**: Document complex business rules and public APIs

### File Organization

```
lib/
├── application/
│   └── use-cases/
│       ├── user/
│       └── room/
├── domain/
│   ├── entities/
│   ├── repositories/
│   ├── services/
│   └── types/
├── infrastructure/
│   ├── repositories/
│   └── services/
└── container/
```

## 🧪 Testing Guidelines

### Test Types

1. **Unit Tests**: Test individual functions and classes
   ```typescript
   Deno.test("CreateUserUseCase - should create user successfully", async () => {
     // Arrange
     const mockRepository = createMockUserRepository();
     const useCase = new CreateUserUseCase(mockRepository, mockPasswordService);
     
     // Act
     const result = await useCase.execute(validInput);
     
     // Assert
     assertEquals(result.success, true);
   });
   ```

2. **Integration Tests**: Test API endpoints and database operations
   ```typescript
   Deno.test("POST /api/users/create - should create user", async () => {
     const response = await fetch("/api/users/create", {
       method: "POST",
       body: JSON.stringify(userData)
     });
     
     assertEquals(response.status, 201);
   });
   ```

3. **Component Tests**: Test UI components
   ```typescript
   Deno.test("LoginForm - should submit valid credentials", () => {
     // Component testing logic
   });
   ```

### Testing Best Practices

- **Arrange-Act-Assert**: Structure tests clearly
- **Descriptive names**: Test names should describe the scenario
- **Mock external dependencies**: Use mocks for repositories and services
- **Test edge cases**: Include error scenarios and boundary conditions
- **Keep tests isolated**: Each test should be independent

## 🎨 UI/UX Guidelines

### Design Principles

- **Accessibility First**: Follow WCAG 2.1 guidelines
- **Mobile-First**: Design for mobile, enhance for desktop
- **Semantic HTML**: Use proper HTML elements for their intended purpose
- **Progressive Enhancement**: Ensure basic functionality without JavaScript

### Component Guidelines

- **Reusable Components**: Create components that can be used across the application
- **Props Interface**: Define clear TypeScript interfaces for component props
- **Styling**: Use Tailwind CSS classes, create semantic CSS classes when needed
- **Islands**: Use islands for interactive functionality only

```typescript
// Example: Component with proper TypeScript interface
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
}

export function Button({ variant, size, disabled, onClick, children }: ButtonProps) {
  // Component implementation
}
```

## 🔄 Pull Request Process

### Before Submitting

1. **Check existing issues**: Look for related issues or discussions
2. **Run tests**: Ensure all tests pass
3. **Code quality**: Run linting and formatting
4. **Documentation**: Update relevant documentation

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Review Process

1. **Automated checks**: CI/CD pipeline runs tests and quality checks
2. **Code review**: Maintainers review code for quality and architecture
3. **Testing**: Changes are tested in development environment
4. **Approval**: At least one maintainer approval required
5. **Merge**: Squash and merge to main branch

## 🐛 Bug Reports

### Before Reporting

1. **Search existing issues**: Check if the bug is already reported
2. **Reproduce the bug**: Ensure you can consistently reproduce it
3. **Check latest version**: Verify the bug exists in the latest version

### Bug Report Template

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., macOS 12.0]
- Browser: [e.g., Chrome 95]
- Deno version: [e.g., 1.37.0]
- SimplyCaster version: [e.g., 1.0.0]

## Additional Context
Screenshots, logs, or other relevant information
```

## 💡 Feature Requests

### Before Requesting

1. **Check roadmap**: Review existing roadmap and issues
2. **Consider scope**: Ensure the feature aligns with project goals
3. **Think about implementation**: Consider how it might be implemented

### Feature Request Template

```markdown
## Feature Description
Clear description of the proposed feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other solutions you've considered

## Additional Context
Mockups, examples, or other relevant information
```

## 🏗️ Architecture Decisions

### Decision Process

1. **Discussion**: Start with GitHub Discussions or issues
2. **RFC**: For significant changes, create an RFC (Request for Comments)
3. **Consensus**: Reach consensus with maintainers and community
4. **Documentation**: Document the decision and rationale

### Architecture Decision Records (ADRs)

For significant architectural decisions, we maintain ADRs in `/docs/adr/`:

```markdown
# ADR-001: Use Clean Architecture

## Status
Accepted

## Context
Need to organize code for maintainability and testability

## Decision
Implement Clean Architecture with dependency injection

## Consequences
- Better testability
- Clear separation of concerns
- Learning curve for contributors
```

## 🚀 Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. **Update version**: Update version in relevant files
2. **Update changelog**: Document changes in CHANGELOG.md
3. **Create release**: Tag and create GitHub release
4. **Deploy**: Deploy to staging and production environments

## 🎓 Learning Resources

### Project-Specific

- **Architecture Guide**: `/docs/architecture.md`
- **API Documentation**: `/routes/api/README.md`
- **Database Schema**: `/database/schema.ts`

### External Resources

- **Fresh Framework**: [https://fresh.deno.dev/](https://fresh.deno.dev/)
- **Deno Documentation**: [https://deno.land/manual](https://deno.land/manual)
- **Clean Architecture**: [Clean Architecture by Robert Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- **TypeScript**: [https://www.typescriptlang.org/docs/](https://www.typescriptlang.org/docs/)

## 🏆 Recognition

Contributors are recognized in:
- **README.md**: Contributors section
- **Release notes**: Acknowledgment of contributions
- **GitHub**: Contributor statistics and badges

## 📞 Getting Help

- **GitHub Discussions**: For questions and general discussion
- **GitHub Issues**: For bug reports and feature requests
- **Discord**: [Join our Discord server](https://discord.gg/simplycaster) (if available)

## 📜 License

By contributing to SimplyCaster, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to SimplyCaster! Together, we're building a better podcasting platform for everyone. 🎙️