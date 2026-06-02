export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
}
