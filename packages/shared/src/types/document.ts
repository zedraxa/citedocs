export type DocumentRole = "owner" | "editor" | "commenter" | "viewer";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface UserPresence {
  userId: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: {
    anchor: number;
    head: number;
  };
}

export interface DocumentPreferences {
  pageSize: "letter" | "a4";
  orientation: "portrait" | "landscape";
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export interface Document {
  id: string;
  title: string;
  ownerId: string;
  cslStyleId: string;
  cslLocale: string;
  preferences: DocumentPreferences;
  createdAt: string;
  updatedAt: string;
}

export type SuggestionType = "insert" | "delete";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export interface Suggestion {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userColor: string;
  type: SuggestionType;
  content: string;
  status: SuggestionStatus;
  timestamp: string;
}

export interface CommentReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  resolved: boolean;
  replies: CommentReply[];
  createdAt: string;
}
