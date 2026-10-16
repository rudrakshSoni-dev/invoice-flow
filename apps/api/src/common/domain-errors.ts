export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export class InvalidStateError extends DomainError {
  readonly code = 'INVALID_STATE';
}

export class DependencyUnavailableError extends DomainError {
  readonly code = 'DEPENDENCY_UNAVAILABLE';
}
