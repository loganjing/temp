import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { PriorityDistribution, ResourceTaskDistribution, ResourceUtilization } from '@/api/types';
import { priorityLabel } from '@/components/common/labels';

export function PriorityPieChart({ data }: { data: PriorityDistribution[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '45%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{d}%', fontSize: 12 },
          data: data.map((d) => ({
            name: priorityLabel(d.priority),
            value: d.count,
          })),
          color: ['#5b8ff9', '#ff9f40', '#ff5b5b'],
        },
      ],
    });
  }, [data]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
}

export function ResourceTaskBarChart({ data }: { data: ResourceTaskDistribution[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.resourceName),
        axisLabel: { interval: 0, rotate: data.length > 6 ? 30 : 0 },
      },
      yAxis: { type: 'value', name: '任务数' },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.taskCount),
          itemStyle: { color: '#5b8ff9', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    });
  }, [data]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
}

export function UtilizationBarChart({ data }: { data: ResourceUtilization[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const arr = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!arr.length) return '';
          const item = arr[0];
          const orig = data[item.dataIndex];
          return `${item.name}<br/>利用率: ${(item.value * 100).toFixed(1)}%<br/>作业时长: ${orig.busyDuration}秒<br/>在线时长: ${orig.onlineDuration}秒`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.resourceName),
        axisLabel: { interval: 0, rotate: data.length > 6 ? 30 : 0 },
      },
      yAxis: {
        type: 'value',
        name: '利用率',
        axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
        max: 1,
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.utilizationRate),
          itemStyle: { color: '#5ad8a6', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    });
  }, [data]);

  return <div ref={ref} style={{ width: '100%', height: '300px' }} />;
}
