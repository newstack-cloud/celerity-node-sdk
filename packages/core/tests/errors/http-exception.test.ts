import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  MethodNotAllowedException,
  NotAcceptableException,
  ConflictException,
  GoneException,
  UnprocessableEntityException,
  TooManyRequestsException,
  InternalServerErrorException,
  NotImplementedException,
  BadGatewayException,
  ServiceUnavailableException,
  GatewayTimeoutException,
} from "../../src/errors/http-exception";

// ---------------------------------------------------------------------------
// HttpException (base class)
// ---------------------------------------------------------------------------

describe("HttpException", () => {
  it("should set statusCode, message, and name", () => {
    const error = new HttpException(418, "I'm a teapot");

    expect(error.statusCode).toBe(418);
    expect(error.message).toBe("I'm a teapot");
    expect(error.name).toBe("HttpException");
  });

  it("should store optional details", () => {
    const details = { field: "email", issue: "invalid format" };
    const error = new HttpException(422, "Validation failed", details);

    expect(error.details).toEqual(details);
  });

  it("should have a proper stack trace", () => {
    const error = new HttpException(500, "boom");

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("HttpException");
  });
});

// ---------------------------------------------------------------------------
// BadRequestException
// ---------------------------------------------------------------------------

describe("BadRequestException", () => {
  it("should default to status 400 and message 'Bad Request'", () => {
    const error = new BadRequestException();

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Bad Request");
    expect(error.name).toBe("BadRequestException");
  });

  it("should accept a custom message", () => {
    const error = new BadRequestException("Invalid payload");

    expect(error.message).toBe("Invalid payload");
    expect(error.statusCode).toBe(400);
  });

  it("should accept details", () => {
    const details = [{ field: "name", error: "required" }];
    const error = new BadRequestException("Validation error", details);

    expect(error.details).toEqual(details);
  });
});

// ---------------------------------------------------------------------------
// UnauthorizedException
// ---------------------------------------------------------------------------

describe("UnauthorizedException", () => {
  it("should default to status 401 and message 'Unauthorized'", () => {
    const error = new UnauthorizedException();

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Unauthorized");
    expect(error.name).toBe("UnauthorizedException");
  });

  it("should accept a custom message and details", () => {
    const error = new UnauthorizedException("Token expired", {
      expiredAt: "2026-01-01",
    });

    expect(error.message).toBe("Token expired");
    expect(error.details).toEqual({ expiredAt: "2026-01-01" });
  });
});

// ---------------------------------------------------------------------------
// ForbiddenException
// ---------------------------------------------------------------------------

describe("ForbiddenException", () => {
  it("should default to status 403 and message 'Forbidden'", () => {
    const error = new ForbiddenException();

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("Forbidden");
    expect(error.name).toBe("ForbiddenException");
  });

  it("should accept a custom message", () => {
    const error = new ForbiddenException("Insufficient permissions");

    expect(error.message).toBe("Insufficient permissions");
  });
});

// ---------------------------------------------------------------------------
// NotFoundException
// ---------------------------------------------------------------------------

describe("NotFoundException", () => {
  it("should default to status 404 and message 'Not Found'", () => {
    const error = new NotFoundException();

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Not Found");
    expect(error.name).toBe("NotFoundException");
  });

  it("should accept a custom message and details", () => {
    const error = new NotFoundException("User not found", {
      userId: "abc",
    });

    expect(error.message).toBe("User not found");
    expect(error.details).toEqual({ userId: "abc" });
  });
});

// ---------------------------------------------------------------------------
// MethodNotAllowedException
// ---------------------------------------------------------------------------

describe("MethodNotAllowedException", () => {
  it("should default to status 405 and message 'Method Not Allowed'", () => {
    const error = new MethodNotAllowedException();

    expect(error.statusCode).toBe(405);
    expect(error.message).toBe("Method Not Allowed");
    expect(error.name).toBe("MethodNotAllowedException");
  });

  it("should accept a custom message and details", () => {
    const error = new MethodNotAllowedException("POST not allowed", { allowed: ["GET"] });

    expect(error.message).toBe("POST not allowed");
    expect(error.details).toEqual({ allowed: ["GET"] });
  });
});

// ---------------------------------------------------------------------------
// NotAcceptableException
// ---------------------------------------------------------------------------

describe("NotAcceptableException", () => {
  it("should default to status 406 and message 'Not Acceptable'", () => {
    const error = new NotAcceptableException();

    expect(error.statusCode).toBe(406);
    expect(error.message).toBe("Not Acceptable");
    expect(error.name).toBe("NotAcceptableException");
  });

  it("should accept a custom message", () => {
    const error = new NotAcceptableException("Cannot produce application/xml");

    expect(error.message).toBe("Cannot produce application/xml");
  });
});

// ---------------------------------------------------------------------------
// ConflictException
// ---------------------------------------------------------------------------

describe("ConflictException", () => {
  it("should default to status 409 and message 'Conflict'", () => {
    const error = new ConflictException();

    expect(error.statusCode).toBe(409);
    expect(error.message).toBe("Conflict");
    expect(error.name).toBe("ConflictException");
  });

  it("should accept a custom message and details", () => {
    const error = new ConflictException("Duplicate entry", { field: "email" });

    expect(error.message).toBe("Duplicate entry");
    expect(error.details).toEqual({ field: "email" });
  });
});

// ---------------------------------------------------------------------------
// GoneException
// ---------------------------------------------------------------------------

describe("GoneException", () => {
  it("should default to status 410 and message 'Gone'", () => {
    const error = new GoneException();

    expect(error.statusCode).toBe(410);
    expect(error.message).toBe("Gone");
    expect(error.name).toBe("GoneException");
  });

  it("should accept a custom message", () => {
    const error = new GoneException("Resource permanently removed");

    expect(error.message).toBe("Resource permanently removed");
  });
});

// ---------------------------------------------------------------------------
// UnprocessableEntityException
// ---------------------------------------------------------------------------

describe("UnprocessableEntityException", () => {
  it("should default to status 422 and message 'Unprocessable Entity'", () => {
    const error = new UnprocessableEntityException();

    expect(error.statusCode).toBe(422);
    expect(error.message).toBe("Unprocessable Entity");
    expect(error.name).toBe("UnprocessableEntityException");
  });

  it("should accept a custom message and details", () => {
    const details = [{ field: "age", error: "must be positive" }];
    const error = new UnprocessableEntityException("Validation failed", details);

    expect(error.message).toBe("Validation failed");
    expect(error.details).toEqual(details);
  });
});

// ---------------------------------------------------------------------------
// TooManyRequestsException
// ---------------------------------------------------------------------------

describe("TooManyRequestsException", () => {
  it("should default to status 429 and message 'Too Many Requests'", () => {
    const error = new TooManyRequestsException();

    expect(error.statusCode).toBe(429);
    expect(error.message).toBe("Too Many Requests");
    expect(error.name).toBe("TooManyRequestsException");
  });

  it("should accept a custom message and details", () => {
    const error = new TooManyRequestsException("Rate limit exceeded", { retryAfter: 60 });

    expect(error.message).toBe("Rate limit exceeded");
    expect(error.details).toEqual({ retryAfter: 60 });
  });
});

// ---------------------------------------------------------------------------
// InternalServerErrorException
// ---------------------------------------------------------------------------

describe("InternalServerErrorException", () => {
  it("should default to status 500 and message 'Internal Server Error'", () => {
    const error = new InternalServerErrorException();

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe("Internal Server Error");
    expect(error.name).toBe("InternalServerErrorException");
  });

  it("should accept a custom message", () => {
    const error = new InternalServerErrorException("Something broke");

    expect(error.message).toBe("Something broke");
    expect(error.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// NotImplementedException
// ---------------------------------------------------------------------------

describe("NotImplementedException", () => {
  it("should default to status 501 and message 'Not Implemented'", () => {
    const error = new NotImplementedException();

    expect(error.statusCode).toBe(501);
    expect(error.message).toBe("Not Implemented");
    expect(error.name).toBe("NotImplementedException");
  });

  it("should accept a custom message", () => {
    const error = new NotImplementedException("Feature coming soon");

    expect(error.message).toBe("Feature coming soon");
  });
});

// ---------------------------------------------------------------------------
// BadGatewayException
// ---------------------------------------------------------------------------

describe("BadGatewayException", () => {
  it("should default to status 502 and message 'Bad Gateway'", () => {
    const error = new BadGatewayException();

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe("Bad Gateway");
    expect(error.name).toBe("BadGatewayException");
  });

  it("should accept a custom message and details", () => {
    const error = new BadGatewayException("Upstream service returned invalid response", {
      upstream: "payment-api",
    });

    expect(error.message).toBe("Upstream service returned invalid response");
    expect(error.details).toEqual({ upstream: "payment-api" });
  });
});

// ---------------------------------------------------------------------------
// ServiceUnavailableException
// ---------------------------------------------------------------------------

describe("ServiceUnavailableException", () => {
  it("should default to status 503 and message 'Service Unavailable'", () => {
    const error = new ServiceUnavailableException();

    expect(error.statusCode).toBe(503);
    expect(error.message).toBe("Service Unavailable");
    expect(error.name).toBe("ServiceUnavailableException");
  });

  it("should accept a custom message and details", () => {
    const error = new ServiceUnavailableException("Under maintenance", {
      retryAfter: "2026-02-11T00:00:00Z",
    });

    expect(error.message).toBe("Under maintenance");
    expect(error.details).toEqual({ retryAfter: "2026-02-11T00:00:00Z" });
  });
});

// ---------------------------------------------------------------------------
// GatewayTimeoutException
// ---------------------------------------------------------------------------

describe("GatewayTimeoutException", () => {
  it("should default to status 504 and message 'Gateway Timeout'", () => {
    const error = new GatewayTimeoutException();

    expect(error.statusCode).toBe(504);
    expect(error.message).toBe("Gateway Timeout");
    expect(error.name).toBe("GatewayTimeoutException");
  });

  it("should accept a custom message", () => {
    const error = new GatewayTimeoutException("Upstream timed out after 30s");

    expect(error.message).toBe("Upstream timed out after 30s");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: each subclass produces the correct name
// ---------------------------------------------------------------------------

describe("exception name uniqueness", () => {
  it("each exception class should have a distinct name property", () => {
    const exceptions = [
      new HttpException(400, "base"),
      new BadRequestException(),
      new UnauthorizedException(),
      new ForbiddenException(),
      new NotFoundException(),
      new MethodNotAllowedException(),
      new NotAcceptableException(),
      new ConflictException(),
      new GoneException(),
      new UnprocessableEntityException(),
      new TooManyRequestsException(),
      new InternalServerErrorException(),
      new NotImplementedException(),
      new BadGatewayException(),
      new ServiceUnavailableException(),
      new GatewayTimeoutException(),
    ];

    const names = exceptions.map((e) => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
