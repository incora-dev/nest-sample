import {
  Table,
  Column,
  DataType,
  Default,
  Scopes,
  DefaultScope,
  ForeignKey,
  HasOne,
  BelongsTo,
} from 'sequelize-typescript';

import BaseModel from '../core/base/base.entiry';
import { ATTRIBUTES_ALIASES } from '../core/database/database.constants';
import { ENTRY_TYPES } from '../entry/entry.constants';
import { EntryEntity } from 'models';

@DefaultScope({
  attributes: ATTRIBUTES_ALIASES.ESTIMATE.listAttributes,
})
@Scopes({
  listAttributes: {
    attributes: ATTRIBUTES_ALIASES.ESTIMATE.listAttributes,
  },
})
@Table({ tableName: 'estimates' })
export default class Estimate extends BaseModel<Estimate> {
  public static updatableFields: string[] =
    ATTRIBUTES_ALIASES.ESTIMATE.listAttributes;

  @Default(DataType.UUIDV4)
  @Column({
    primaryKey: true,
    type: DataType.UUID,
  })
  public id: string;

  @Default('')
  @Column({
    allowNull: false,
    field: 'type',
    type: DataType.ENUM([ENTRY_TYPES.TIME, ENTRY_TYPES.EXPENSE]),
    defaultValue: ENTRY_TYPES.TIME,
  })
  public type: string;

  @Default('')
  @ForeignKey(() => EntryEntity)
  @Column({
    allowNull: false,
    field: 'low_estimate',
    type: DataType.UUID,
  })
  public lowEstimateId: string;

  @Default('')
  @ForeignKey(() => EntryEntity)
  @Column({
    allowNull: false,
    field: 'medium_estimate',
    type: DataType.UUID,
  })
  public mediumEstimateId: string;

  @Default('')
  @ForeignKey(() => EntryEntity)
  @Column({
    allowNull: false,
    field: 'high_estimate',
    type: DataType.UUID,
  })
  public highEstimateId: string;

  @Column({
    allowNull: false,
    field: 'average',
    type: DataType.INTEGER,
  })
  public average: number;

  @Column({ field: 'created_at', type: DataType.DATE })
  public createdAt: Date;

  @Column({ field: 'updated_at', type: DataType.DATE })
  public updatedAt: Date;

  @BelongsTo(() => EntryEntity)
  public lowEstimate: EntryEntity;

  @BelongsTo(() => EntryEntity)
  public mediumEstimate: EntryEntity;

  @BelongsTo(() => EntryEntity)
  public highEstimate: EntryEntity;
}
