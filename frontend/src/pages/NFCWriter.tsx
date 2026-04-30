// frontend/src/pages/NFCWriter.tsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, Input, Button, Space, message, Alert, Descriptions, Select, Typography, Divider, Breadcrumb, Steps, Collapse, Tag, Tooltip, Row, Col, Spin } from 'antd';
import { EditOutlined, CopyOutlined, CheckCircleOutlined, HomeOutlined, ScanOutlined, ClearOutlined, InfoCircleOutlined, EnvironmentOutlined, ThunderboltOutlined, MobileOutlined, WifiOutlined, GlobalOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listShelves } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface ShelfOption { id: number; name: string }

function getLocalIP(): string {
  const h = window.location.hostname;
  return (h !== 'localhost' && h !== '127.0.0.1') ? h : 'localhost';
}

const NFCWriter: React.FC = () => {
  const navigate = useNavigate();
  
  const [shelves, setShelves] = useState<ShelfOption[]>([]);
  const [shelvesLoading, setShelvesLoading] = useState(false);
  const [selectedShelfId, setSelectedShelfId] = useState<number | undefined>(undefined);
  const [selectedShelfName, setSelectedShelfName] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [writeResult, setWriteResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [localIP, setLocalIP] = useState('localhost');
  const [bridgeTaskId, setBridgeTaskId] = useState<string | null>(null);

  // 加载书架列表
  useEffect(() => {
    setShelvesLoading(true);
    listShelves()
      .then((data: any) => {
        const opts = (Array.isArray(data) ? data : []).map((s: any) => ({
          id: s.logical_shelf_id,
          name: s.shelf_name,
        }));
        setShelves(opts);
        if (opts.length > 0) {
          setSelectedShelfId(opts[0].id);
          setSelectedShelfName(opts[0].name);
        }
      })
      .catch(() => message.error('加载书架失败'))
      .finally(() => setShelvesLoading(false));
  }, []);

  // 获取 IP
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/nfc/generate-scan-link`)
      .then(r => r.json())
      .then(d => { if (d.local_ip) setLocalIP(d.local_ip); })
      .catch(() => setLocalIP(getLocalIP()));
  }, []);

  const bridgeURL = useMemo(
    () => localIP !== 'localhost' ? `http://${localIP}:8000/api/nfc/mobile` : `${API_BASE_URL}/api/nfc/mobile`,
    [localIP]
  );

  const handleShelfChange = useCallback((id: number) => {
    setSelectedShelfId(id);
    const s = shelves.find(x => x.id === id);
    if (s) setSelectedShelfName(s.name);
  }, [shelves]);

  const handleWrite = useCallback(async () => {
    if (!selectedShelfId) { message.warning('请选择书架'); return; }
    setLoading(true); setError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/nfc/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelf_id: selectedShelfId, shelf_name: selectedShelfName }),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || '生成失败');
      const result = await resp.json();
      setWriteResult(result);
      setBridgeTaskId(result.task_id);
      message.success('写入数据已生成！请在手机端完成 NFC 写入');
    } catch (err: any) {
      setError(err?.message || '生成失败');
    } finally { setLoading(false); }
  }, [selectedShelfId, selectedShelfName]);

  const handleCopyPayload = useCallback(() => {
    if (writeResult?.payload) {
      navigator.clipboard.writeText(writeResult.payload).then(() => message.success('已复制'));
    }
  }, [writeResult]);

  const handleCopyURL = useCallback(() => {
    navigator.clipboard.writeText(bridgeURL).then(() => message.success('地址已复制'));
  }, [bridgeURL]);

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: <span><EditOutlined /> NFC 写入</span> }]} />
      <div style={{ marginBottom: 24 }}><Title level={2}><EditOutlined style={{ marginRight: 12, color: '#8B4513' }} />NFC 标签写入</Title><Text type="secondary">选择书架，生成数据，在手机端完成 NFC 写入</Text></div>

      <Alert message={<Space><WifiOutlined /> 手机端地址 {localIP !== 'localhost' && <Tag color="green">{localIP}</Tag>}</Space>} description={<div><Text>手机浏览器打开：</Text><Text code copyable style={{ marginLeft: 8 }}>{bridgeURL}</Text></div>} type="info" style={{ marginBottom: 24, borderRadius: 8 }} />

      <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}>
        <Collapse ghost items={[{ key: 'guide', label: <Space><InfoCircleOutlined style={{ color: '#3b82f6' }} />使用说明</Space>, children: <div><Steps direction="vertical" size="small" current={-1} items={[{ title: '选择书架', description: '从下拉列表选择目标逻辑书架' }, { title: '生成数据', description: '点击生成按钮，创建写入数据' }, { title: '手机端写入', description: '手机打开桥接地址，复制数据，写入标签' }, { title: '扫描验证', description: '扫描标签自动跳转到对应书架' }]} /></div> }]} />
      </Card>

      <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <label style={{ fontWeight: 500, fontSize: 15, display: 'block', marginBottom: 8 }}><ThunderboltOutlined style={{ color: '#f59e0b', marginRight: 6 }} />选择目标书架</label>
            <Select
              placeholder="选择书架..."
              style={{ width: '100%' }}
              size="large"
              value={selectedShelfId}
              onChange={handleShelfChange}
              loading={shelvesLoading}
              showSearch
              filterOption={(input, option) => (option?.children as string)?.includes(input)}
            >
              {shelves.map(s => (<Option key={s.id} value={s.id}><EnvironmentOutlined style={{ color: '#8B4513', marginRight: 8 }} />{s.name}</Option>))}
            </Select>
          </div>
          <Button type="primary" icon={<EditOutlined />} loading={loading} onClick={handleWrite} size="large" disabled={!selectedShelfId} style={{ borderRadius: 8, minWidth: 200 }}>
            {loading ? '生成中...' : '生成写入数据'}
          </Button>
        </Space>
      </Card>

      {error && <Alert message="生成失败" description={error} type="error" showIcon closable style={{ marginBottom: 24, borderRadius: 8 }} action={<Button size="small" onClick={handleWrite}>重试</Button>} />}

      {writeResult && (
        <Card style={{ borderRadius: 12, border: '1px solid #d1fae5', borderLeft: '4px solid #22c55e', marginBottom: 24 }}
          title={<Space><CheckCircleOutlined style={{ color: '#22c55e', fontSize: 18 }} />数据已生成 <Tag color="success">成功</Tag></Space>}>
          <Descriptions column={1} bordered size="middle" labelStyle={{ fontWeight: 500, background: '#fafaf9' }}>
            <Descriptions.Item label="目标书架"><Text strong>{writeResult.shelf_name} (#{writeResult.shelf_id})</Text></Descriptions.Item>
            <Descriptions.Item label={<div style={{ display: 'flex', justifyContent: 'space-between' }}><span>标签内容 (JSON)</span><Button type="primary" size="small" icon={<CopyOutlined />} onClick={handleCopyPayload}>复制</Button></div>}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, fontFamily: 'monospace', color: '#374151', background: '#fafaf9', padding: 12, borderRadius: 6 }}>{writeResult.payload}</pre>
            </Descriptions.Item>
          </Descriptions>
          <Divider />
          <div style={{ textAlign: 'center' }}>
            <MobileOutlined style={{ fontSize: 32, color: '#8B4513', marginBottom: 12 }} />
            <Text strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>请在手机端完成 NFC 写入</Text>
            <Input value={bridgeURL} readOnly style={{ textAlign: 'center', fontFamily: 'monospace', marginBottom: 12 }} suffix={<Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyURL} />} />
            <Space>
              <Button type="primary" icon={<MobileOutlined />} onClick={() => window.open(bridgeURL, '_blank')}>在浏览器中打开</Button>
              <Button icon={<CopyOutlined />} onClick={handleCopyURL}>复制地址</Button>
            </Space>
          </div>
        </Card>
      )}
    </div>
  );
};

export default NFCWriter;