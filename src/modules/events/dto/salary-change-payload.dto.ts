import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';

export class SalaryChangePayloadDto {
  @ApiProperty({
    description: 'Date when the salary change takes effect',
    example: '2026-01-15',
  })
  @IsDateString()
  effectiveDate!: string;

  @ApiProperty({ description: 'New salary amount', example: 75000 })
  @IsNumber()
  @IsPositive()
  newSalary!: number;

  @ApiProperty({ description: 'Currency code (ISO 4217)', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency!: string;
}
