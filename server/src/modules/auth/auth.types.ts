export interface UserIdentity {
  id: string;
}

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  preferredLanguage: string | null;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
