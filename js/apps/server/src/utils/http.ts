export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

type AsyncHandler = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
