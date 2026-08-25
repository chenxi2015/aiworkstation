import { type FormEvent, useEffect, useState } from 'react';
import {
  Modal,
  Button,
  TextField,
  Input,
  TextArea,
  Label,
  FieldError,
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopover,
  ListBox,
  ListBoxItem,
} from '@heroui/react';
import type { Folder } from './types';
import { CATEGORIES } from './types';

interface FolderModalProps {
  isOpen: boolean;
  folder: Folder | null;
  defaultCategory: string;
  onClose: () => void;
  onSave: (data: {
    id?: number;
    name: string;
    category: string;
    desc: string;
  }) => void;
  onDelete: (id: number) => void;
}

export function FolderModal({
  isOpen,
  folder,
  defaultCategory,
  onClose,
  onSave,
  onDelete,
}: FolderModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');

  const isEdit = !!folder;

  useEffect(() => {
    if (isOpen) {
      if (folder) {
        setName(folder.name);
        setCategory(folder.category);
        setDesc(folder.desc || '');
      } else {
        setName('');
        setCategory(defaultCategory || '工作台');
        setDesc('');
      }
      setError('');
    }
  }, [isOpen, folder, defaultCategory]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }

    onSave({
      id: folder?.id,
      name: trimmed,
      category,
      desc: desc.trim(),
    });
  };

  const handleDelete = () => {
    if (!folder) return;
    if (window.confirm(`确定删除文件夹「${folder.name}」吗？此操作不可撤销。`)) {
      onDelete(folder.id);
    }
  };

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      variant="blur"
    >
      <Modal.Container size="sm">
        <Modal.Dialog>
          {/* Built-in close button from HeroUI */}
          <Modal.CloseTrigger />

          {/* Modal Header */}
          <Modal.Header>
            <Modal.Heading>
              {isEdit ? '编辑文件夹' : '新建文件夹'}
            </Modal.Heading>
          </Modal.Header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Modal.Body className="flex flex-col gap-4">
              {/* Folder Name */}
              <TextField
                value={name}
                onChange={(val) => {
                  setName(val);
                  if (error) setError('');
                }}
                isInvalid={!!error}
              >
                <Label>
                  文件夹名称 <span className="text-danger">*</span>
                </Label>
                <Input placeholder="例如：内容创作工具集" maxLength={30} />
                {error && <FieldError>{error}</FieldError>}
              </TextField>

              {/* Category Select */}
              <Select
                selectedKey={category}
                onSelectionChange={(key) => {
                  if (key) setCategory(String(key));
                }}
              >
                <Label>所属分类</Label>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopover>
                  <ListBox>
                    {CATEGORIES.map((cat) => (
                      <ListBoxItem key={cat} id={cat} textValue={cat}>
                        {cat}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </SelectPopover>
              </Select>

              {/* Description */}
              <TextField value={desc} onChange={setDesc}>
                <Label>描述（可选）</Label>
                <TextArea
                  placeholder="这个文件夹用来归集什么？"
                  maxLength={120}
                  rows={3}
                />
              </TextField>
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="flex items-center justify-between">
              <div>
                {isEdit && (
                  <Button
                    type="button"
                    variant="danger-soft"
                    size="sm"
                    className="rounded-full"
                    onPress={handleDelete}
                  >
                    删除
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="rounded-full"
                >
                  {isEdit ? '保存' : '创建'}
                </Button>
              </div>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
