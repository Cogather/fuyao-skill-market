import type { Locator } from '@playwright/test';

export async function openHarnessSelect(control: Locator): Promise<Locator> {
  const trigger = control.and(control.page().getByRole('combobox'));
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const id = await trigger.getAttribute('aria-controls');
  return trigger.page().locator(`[id=${JSON.stringify(id)}]`);
}

/** Select through the visible menu; native controls outside the workspace remain supported. */
export async function selectHarnessOption(
  control: Locator,
  choice: string | { label?: string; value?: string; index?: number },
): Promise<void> {
  const trigger = control.and(control.page().getByRole('combobox'));
  if (await trigger.evaluate((element) => element.tagName === 'SELECT')) {
    await trigger.selectOption(choice);
    return;
  }
  const menu = await openHarnessSelect(trigger);
  const option =
    typeof choice === 'object' && choice.label !== undefined
      ? menu.getByRole('option', { name: choice.label, exact: true })
      : typeof choice === 'object' && choice.index !== undefined
        ? menu.getByRole('option').nth(choice.index)
        : menu.locator(
            `[role="option"][data-value=${JSON.stringify(typeof choice === 'string' ? choice : choice.value)}]`,
          );
  await option.click();
}
