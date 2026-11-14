import type { DateString, Transaction } from '@moayo/core';
import { createContext, useContext } from 'react';

export interface EditorRequest {
  /** 고칠 내역. 없으면 새로 입력. */
  tx?: Transaction;
  /** 새로 입력할 때 기본 날짜(달력에서 날짜를 누르고 추가할 때). */
  date?: DateString;
  /** 사진·문구 자동 입력 화면을 연다. */
  importMode?: 'image' | 'text';
  /** 자동 입력에 미리 넣을 문구(클립보드·공유). */
  text?: string;
  /** 자동 입력에 미리 넣을 사진(갤러리 공유). */
  files?: File[];
  /** files 가 방금 카메라로 찍은 사진인지(영수증 사진으로 내역에 남길지 정할 때 쓴다). */
  fromCamera?: boolean;
}

export const EditorContext = createContext<((req?: EditorRequest) => void) | null>(null);

export function useOpenEditor(): (req?: EditorRequest) => void {
  const open = useContext(EditorContext);
  if (!open) throw new Error('EditorContext 가 없습니다.');
  return open;
}
