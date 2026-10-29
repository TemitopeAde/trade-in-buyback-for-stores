import React, { useState, type ReactNode } from 'react';
import type { MessageKey } from '../../../lib/i18n';
import { useMemberSession } from './env';
import { Loading, TradeInEmptyState, WidgetButton } from './primitives';
import { useWidget } from './WidgetThemeProvider';

/**
 * Shows its children to signed-in members; visitors get a prompt to log in or sign up.
 * `header` is shown above the prompt, since the children (which usually render it) are not.
 */
export function MemberGate({ message, header, children }: { message: MessageKey; header?: ReactNode; children: ReactNode }) {
  const { t } = useWidget();
  const { status, login } = useMemberSession();
  const [busy, setBusy] = useState(false);
  if (status === 'member') return <>{children}</>;
  if (status === 'loading') return <div className="ti-stack">{header}<Loading /></div>;
  const onLogin = async () => {
    setBusy(true);
    try {
      await login();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ti-stack">
      {header}
      <TradeInEmptyState body={t(message)} action={<WidgetButton busy={busy} onClick={onLogin}>{t('member.login')}</WidgetButton>} />
    </div>
  );
}
