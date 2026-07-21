'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetWordbook } from '@/app/actions/wordbooks';

export function ResetWordbookButton({ wordbookId, wordbookName }: { wordbookId: number; wordbookName: string }) {
  const [resetting, setResetting] = useState(false);
  const router = useRouter();

  async function handleReset() {
    const confirmed = window.confirm(
      `'${wordbookName}' 단어집의 회독 진행상황과 기록을 모두 삭제하고 처음 상태로 되돌립니다. 계속할까요?`
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      await resetWordbook(wordbookId);
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <button
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text-muted shadow-card transition hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
      onClick={handleReset}
      disabled={resetting}
    >
      <span aria-hidden className="text-sm leading-none">
        ↺
      </span>
      {resetting ? '초기화 중...' : `${wordbookName} 초기화`}
    </button>
  );
}
