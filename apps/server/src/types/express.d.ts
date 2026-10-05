declare global {
  namespace Express {
    interface Request {
      /** Set by the `requireAuth` middleware. */
      user?: { id: string };
    }
  }
}

export {};
