import React, { useState, type ReactNode } from 'react';
import type { MessageKey } from '../../../lib/i18n';
import { useMemberSession } from './env';
import { Loading, TradeInEmptyState, WidgetButton } from './primitives';
import { useWidget } from './WidgetThemeProvider';

/** Shows its children to signed-in members; visitors get a prompt to log in or sign up. */
export function MemberGate({ message, children }: { message: MessageKey; children: ReactNode }) {
  const { t } = useWidget();
  const { status, login } = useMemberSession();
  const [busy, setBusy] = useState(false);
  if (status === 'loading') return <Loading />;
  if (status === 'member') return <>{children}</>;
  const onLogin = async () => {
    setBusy(true);
    try {
      await login();
    } finally {
      setBusy(false);
    }
  };
  return <TradeInEmptyState body={t(message)} action={<WidgetButton busy={busy} onClick={onLogin}>{t('member.login')}</WidgetButton>} />;
}
