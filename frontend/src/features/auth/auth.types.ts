/** The public user shape. Never includes passwordHash -- the API does not send it. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  businessId: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};
