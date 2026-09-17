import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceController, FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController, EvidenceController],
  providers: [FilesService, EvidenceService],
  exports: [FilesService, EvidenceService],
})
export class FilesModule {}
