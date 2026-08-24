import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class BankAccountChangePayloadDto {
  @ApiProperty({ description: 'Date when the bank account change takes effect', example: '2026-03-01' })
  @IsDateString()
  effectiveDate!: string;

  @ApiProperty({ description: 'International Bank Account Number', example: 'DE89370400440532013000' })
  @IsString()
  @IsNotEmpty()
  iban!: string;
}
