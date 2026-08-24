import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class AddressChangePayloadDto {
  @ApiProperty({ description: 'Date when the address change takes effect', example: '2026-02-01' })
  @IsDateString()
  effectiveDate!: string;

  @ApiProperty({ description: 'Street address', example: '123 Main Street' })
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiProperty({ description: 'City', example: 'Boston' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'Postal code', example: '02101' })
  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @ApiProperty({ description: 'Country', example: 'US' })
  @IsString()
  @IsNotEmpty()
  country!: string;
}
