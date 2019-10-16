import { EntryEntity } from 'models';

export class TopEntriesResponseDto {
  public entries: EntryEntity[];
  public success: boolean;
}

export interface IEstimate {
  lowEstimate: EntryEntity;
  mediumEstimate: EntryEntity;
  highEstimate: EntryEntity;
  average: number;
}
