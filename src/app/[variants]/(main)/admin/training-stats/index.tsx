'use client';

import { Empty, FormGroup } from '@lobehub/ui';
import { Alert, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { GraduationCapIcon } from 'lucide-react';
import { memo } from 'react';

import { AdminGuard } from '@/components/AdminGuard';
import { useClientDataSWR } from '@/libs/swr';

interface TrainingStatsItem {
  agentId: string;
  agentTitle: string;
  completedAt: string;
  employeeName: string;
  finalScore: number;
  userId: string;
}

interface TrainingStatsResponse {
  results: TrainingStatsItem[];
}

const fetchTrainingStats = async (): Promise<TrainingStatsResponse> => {
  const response = await fetch('/api/training-results');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to fetch training stats');
  }

  return response.json();
};

const TrainingStatsPage = memo(() => {
  const { data, error, isLoading } = useClientDataSWR<TrainingStatsResponse>(
    'training-stats',
    fetchTrainingStats,
  );

  return (
    <AdminGuard>
      <FormGroup
        title="Training Simulator Stats"
        variant="filled"
        extra={
          <Typography.Text type="secondary">Latest result per employee and training agent</Typography.Text>
        }
      >
        {error && (
          <Alert
            showIcon
            description={error.message}
            message="Failed to load training stats"
            style={{ marginBottom: 16 }}
            type="error"
          />
        )}
        <Table<TrainingStatsItem>
          dataSource={data?.results || []}
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          rowKey={(record) => `${record.userId}:${record.agentId}:${record.completedAt}`}
          columns={[
            {
              dataIndex: 'employeeName',
              key: 'employeeName',
              title: 'Employee Name',
            },
            {
              dataIndex: 'agentTitle',
              key: 'agentTitle',
              title: 'Agent Name',
            },
            {
              dataIndex: 'finalScore',
              key: 'finalScore',
              render: (value: number) => (
                <Tag color={value >= 70 ? 'success' : value >= 40 ? 'warning' : 'error'}>{value}</Tag>
              ),
              sorter: (a, b) => a.finalScore - b.finalScore,
              title: 'Final Score',
            },
            {
              dataIndex: 'completedAt',
              key: 'completedAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
              sorter: (a, b) => dayjs(a.completedAt).valueOf() - dayjs(b.completedAt).valueOf(),
              title: 'Completed At',
            },
          ]}
          locale={{
            emptyText: <Empty description="No completed training sessions yet" icon={GraduationCapIcon} />,
          }}
        />
      </FormGroup>
    </AdminGuard>
  );
});

export default TrainingStatsPage;

