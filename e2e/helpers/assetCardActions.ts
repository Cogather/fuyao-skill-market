import type { Locator } from '@playwright/test';

export async function openAssetCardMenu(card: Locator): Promise<Locator> {
  const more = card.getByRole('button', { name: /^更多操作：/ });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  return card.getByRole('menu');
}

export async function clickAssetCardAction(card: Locator, action: string): Promise<void> {
  const menu = await openAssetCardMenu(card);
  await menu.getByRole('menuitem', { name: action, exact: true }).click();
}
