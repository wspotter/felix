/**
 * VIP Pipeline Client
 * ====================
 * 
 * TypeScript client for interacting with the VIP (Vision Inventory Pipeline) API.
 */

import axios from 'axios';

export interface VIPConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface DatasetInfo {
  name: string;
  path: string;
  completed_at: string;
  train_images: number;
  val_images: number;
  total_images: number;
  size_mb: number;
  has_labels: boolean;
}

export interface DatasetDetails extends DatasetInfo {
  stats: {
    train_images: number;
    val_images: number;
    total_images: number;
    dataset_size_mb: number;
    has_labels: boolean;
  };
  classes: string[];
  format: string;
  metadata: Record<string, any>;
}

export interface PipelineStatus {
  project_name: string;
  config_path: string;
  data_directory: string;
  phases: PhaseStatus[];
  overall_progress: number;
  is_complete: boolean;
  final_dataset_stats?: {
    train_images: number;
    val_images: number;
    total_images: number;
    dataset_size_mb: number;
    has_labels: boolean;
  };
}

export interface PhaseStatus {
  name: string;
  description: string;
  completed: boolean;
  output_exists: boolean;
  completion_time?: string;
  stats?: Record<string, any>;
  output_stats?: {
    exists: boolean;
    total_files: number;
    total_size_mb: number;
    file_types: Record<string, number>;
  };
}

export interface ProcessStatus {
  process_id: string;
  command: string;
  start_time: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  output: string[];
  config_path: string;
  phase?: string;
  end_time?: number;
  duration?: number;
  return_code?: number;
}

export interface StartPipelineOptions {
  config: string;
  phase?: string;
  force?: boolean;
  workers?: number;
  augmentations?: number;
  verbose?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  message: string;
}

export class VIPClient {
  private client: any;

  constructor(config: VIPConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: config.apiKey ? { 'X-API-Key': config.apiKey } : {},
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  async listDatasets(): Promise<DatasetInfo[]> {
    try {
      const response = await this.client.get('/api/datasets');
      return response.data;
    } catch (error) {
      console.error('Failed to list datasets:', error);
      return [];
    }
  }

  async getDataset(datasetName: string): Promise<DatasetDetails | null> {
    try {
      const response = await this.client.get(`/api/datasets/${datasetName}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Failed to get dataset ${datasetName}:`, error);
      return null;
    }
  }

  async getPipelineStatus(configName: string): Promise<PipelineStatus | null> {
    try {
      const response = await this.client.get(`/api/status/${configName}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Failed to get pipeline status for ${configName}:`, error);
      return null;
    }
  }

  async startPipeline(options: StartPipelineOptions): Promise<string | null> {
    try {
      const response = await this.client.post('/api/start', options);
      if (response.data.success) {
        return response.data.process_id;
      }
      return null;
    } catch (error) {
      console.error('Failed to start pipeline:', error);
      return null;
    }
  }

  async getProcessStatus(processId: string): Promise<ProcessStatus | null> {
    try {
      const response = await this.client.get(`/api/process/${processId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Failed to get process status for ${processId}:`, error);
      return null;
    }
  }

  async stopPipeline(processId: string): Promise<boolean> {
    try {
      const response = await this.client.post(`/api/pipeline/stop/${processId}`);
      return response.data.success === true;
    } catch (error) {
      console.error(`Failed to stop pipeline ${processId}:`, error);
      return false;
    }
  }

  async getLogs(configName: string, lines: number = 100): Promise<string[]> {
    try {
      const response = await this.client.get(`/api/logs/${configName}`, {
        params: { lines },
      });
      return response.data.logs || [];
    } catch (error) {
      console.error(`Failed to get logs for ${configName}:`, error);
      return [];
    }
  }

  async validateConfig(configName: string): Promise<ValidationResult> {
    try {
      const response = await this.client.post('/api/validate/config', {
        config: configName,
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to validate config ${configName}:`, error);
      return {
        valid: false,
        errors: ['Failed to communicate with VIP API'],
        warnings: [],
        message: 'API communication error',
      };
    }
  }

  formatDatasetInfo(dataset: DatasetInfo): string {
    return [
      `📊 **${dataset.name}**`,
      `• Total: ${dataset.total_images} images (${dataset.size_mb.toFixed(2)} MB)`,
      `• Train: ${dataset.train_images} images`,
      `• Val: ${dataset.val_images} images`,
      `• Labels: ${dataset.has_labels ? '✅ Yes' : '❌ No'}`,
      `• Completed: ${dataset.completed_at}`,
    ].join('\n');
  }

  formatPipelineStatus(status: PipelineStatus): string {
    const progress = Math.round(status.overall_progress * 100);
    const lines = [
      `📦 **${status.project_name}**`,
      `Progress: ${progress}% ${this.getProgressBar(status.overall_progress)}`,
      '',
      '**Phases:**',
    ];

    for (const phase of status.phases) {
      const icon = phase.completed ? '✅' : '⏳';
      lines.push(`${icon} ${phase.name}: ${phase.description}`);
      if (phase.stats && Object.keys(phase.stats).length > 0) {
        for (const [key, value] of Object.entries(phase.stats)) {
          lines.push(`  • ${key}: ${value}`);
        }
      }
    }

    if (status.is_complete && status.final_dataset_stats) {
      lines.push('');
      lines.push('**Final Dataset:**');
      lines.push(`• Total: ${status.final_dataset_stats.total_images} images`);
      lines.push(`• Train: ${status.final_dataset_stats.train_images}`);
      lines.push(`• Val: ${status.final_dataset_stats.val_images}`);
    }

    return lines.join('\n');
  }

  private getProgressBar(progress: number, length: number = 20): string {
    const filled = Math.round(progress * length);
    const empty = length - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}

export default VIPClient;
