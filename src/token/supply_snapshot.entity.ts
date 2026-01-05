import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('supply_snapshots')
@Index(['createdAt']) // Для построения графиков и отчетов
export class SupplySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
  circulatingSupply: string; // Токены в обороте (на руках)

  @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
  totalMinted: string; // Всего выпущено за все время

  @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
  totalBurned: string; // Всего сожжено за все время

  @Column({ type: 'varchar', length: 66, nullable: true })
  triggerTransactionHash: string; // Хэш транзакции, вызвавшей изменение (Mint/Burn)

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // Причины изменения, служебные данные

  @CreateDateColumn()
  createdAt: Date;
}
