/** The public user shape. Never includes passwordHash -- the API does not send it. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  businessId: string;
  /** Present after the /auth/me revalidation; absent from an old localStorage session. */
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};
