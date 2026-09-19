import { IsMongoId } from 'class-validator';

export class ObjectIdParamDto {
  @IsMongoId({ message: 'id must be a valid Mongo ObjectId' })
  id: string;
}
