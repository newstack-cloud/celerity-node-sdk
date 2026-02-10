export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpException";
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad Request", details?: unknown) {
    super(400, message, details);
    this.name = "BadRequestException";
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, message, details);
    this.name = "UnauthorizedException";
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden", details?: unknown) {
    super(403, message, details);
    this.name = "ForbiddenException";
  }
}

export class NotFoundException extends HttpException {
  constructor(message = "Not Found", details?: unknown) {
    super(404, message, details);
    this.name = "NotFoundException";
  }
}

export class MethodNotAllowedException extends HttpException {
  constructor(message = "Method Not Allowed", details?: unknown) {
    super(405, message, details);
    this.name = "MethodNotAllowedException";
  }
}

export class NotAcceptableException extends HttpException {
  constructor(message = "Not Acceptable", details?: unknown) {
    super(406, message, details);
    this.name = "NotAcceptableException";
  }
}

export class ConflictException extends HttpException {
  constructor(message = "Conflict", details?: unknown) {
    super(409, message, details);
    this.name = "ConflictException";
  }
}

export class GoneException extends HttpException {
  constructor(message = "Gone", details?: unknown) {
    super(410, message, details);
    this.name = "GoneException";
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = "Unprocessable Entity", details?: unknown) {
    super(422, message, details);
    this.name = "UnprocessableEntityException";
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message = "Too Many Requests", details?: unknown) {
    super(429, message, details);
    this.name = "TooManyRequestsException";
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = "Internal Server Error", details?: unknown) {
    super(500, message, details);
    this.name = "InternalServerErrorException";
  }
}

export class NotImplementedException extends HttpException {
  constructor(message = "Not Implemented", details?: unknown) {
    super(501, message, details);
    this.name = "NotImplementedException";
  }
}

export class BadGatewayException extends HttpException {
  constructor(message = "Bad Gateway", details?: unknown) {
    super(502, message, details);
    this.name = "BadGatewayException";
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = "Service Unavailable", details?: unknown) {
    super(503, message, details);
    this.name = "ServiceUnavailableException";
  }
}

export class GatewayTimeoutException extends HttpException {
  constructor(message = "Gateway Timeout", details?: unknown) {
    super(504, message, details);
    this.name = "GatewayTimeoutException";
  }
}
