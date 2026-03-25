export interface Category {
  id: string;
  name: string;
  icon: string;
  thumbnail?: string;
  subcategories?: string[];
  isLikedCategory?: boolean;
}

export interface Photo {
  id: string;
  url: string;
  title: string;
  categoryId: string;
  subcategory?: string;
  likes: number;
  author?: string;
}

export interface Like {
  id: string;
  userId: string;
  photoId: string;
}

export interface UserRole {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
