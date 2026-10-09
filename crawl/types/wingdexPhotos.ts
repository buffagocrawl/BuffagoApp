export type PhotoVote = 1 | -1 | null;
/** Safe public response. Storage paths are confined to the protected media server. */
export interface ApprovedPhoto {
  submission_id: string;
  destination_id: string;
  media_type: 'photo';
  status: 'approved';
  signed_url: string;
  expires_at: string;
  created_at: string;
  like_count: number;
  dislike_count: number;
  current_vote?: PhotoVote;
}
