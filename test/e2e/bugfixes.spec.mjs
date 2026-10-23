import {test,expect} from '@playwright/test';
const dashboard = page => page.getByRole('navigation',{name:'Dashboard',exact:true});
async function login(page, role='owner') {
  await page.goto('/manage');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(`audit-${role}@example.test`);
  await page.getByLabel('Password',{exact:true}).fill('Synthetic-audit-42!');
  await page.getByRole('button',{name:'Step inside →',exact:true}).click();
  await expect(dashboard(page)).toBeVisible();
}
async function payroll(page) {
  await dashboard(page).getByRole('button',{name:'Accounting',exact:true}).click();
  await page.getByRole('button',{name:'Employees & payroll',exact:true}).click();
  await page.getByRole('button',{name:'Payslips & payroll',exact:true}).click();
  await page.getByRole('button',{name:'＋ Payroll run',exact:true}).click();
}
async function tax(page) {
  await page.locator('.finance-nav-group summary').getByText('Reporting',{exact:true}).click();
  await page.getByRole('button',{name:'Tax & VAT',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tax codes',exact:true})).toBeVisible();
}
test('artist names remain literal text in public gallery and details',async({page})=>{
  await page.goto('/b/magic-by-sam#performers');
  const name='Audit <b data-audit-marker="artist-name">marker</b>';
  await expect(page.locator('[data-artist-profile="marker"] strong')).toHaveText(name);
  await expect(page.locator('[data-audit-marker]')).toHaveCount(0);
  await page.locator('[data-artist-profile="marker"]').click();
  await expect(page.getByRole('dialog').getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(page.locator('[data-audit-marker]')).toHaveCount(0);
});
test('pay-basis switching preserves monthly and manually adjusted salary through draft saving',async({page})=>{
  await login(page); await payroll(page);
  const dialog=page.getByRole('dialog'),basis=dialog.getByRole('combobox',{name:'Pay basis',exact:true}),basic=dialog.getByLabel('Basic pay (USD)',{exact:true});
  await expect(basic).toHaveValue('1000');
  await basis.selectOption('hourly'); await basis.selectOption('monthly');
  await expect(basic).toHaveValue('1000');
  await basic.fill('1200'); await basis.selectOption('hourly'); await basis.selectOption('monthly');
  await expect(basic).toHaveValue('1200');
  await dialog.getByRole('textbox',{name:'Payslip name',exact:true}).fill('Fictional browser salary regression');
  await dialog.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Net pay $1,200.00');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Basic pay (USD)',{exact:true})).toHaveValue('1200');
});
test('supplier language changes preserve registration details and require fresh agreement selection',async({page})=>{
  await page.goto('/supplier/magic-by-sam');
  await page.getByRole('button',{name:'Register as a supplier',exact:true}).click();
  await page.getByLabel('Business or stage name',{exact:true}).fill('Fictional bilingual artist');
  await page.getByLabel('Biography',{exact:true}).fill('Fictional biography retained across languages.');
  await page.locator('[name="type"][value="artist"]').check();
  for(const language of ['fr','ar','en']) {
    await page.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang',language);
    await expect(page.locator('[name="bio"]')).toHaveValue('Fictional biography retained across languages.');
    await expect(page.locator('[name="name"]')).toHaveValue('Fictional bilingual artist');
    await expect(page.locator('[name="type"][value="artist"]')).toBeChecked();
    await expect(page.locator('[name="registrationAgreement"]')).not.toBeChecked();
  }
});
test('Backstage refresh, Back and report navigation restore the destination',async({page})=>{
  await login(page); await dashboard(page).getByRole('button',{name:'Accounting',exact:true}).click(); await tax(page);
  await expect(page).toHaveURL(/#money\/desk\/tax$/);
  await page.reload(); await expect(page.getByRole('heading',{name:'Tax codes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Employees & payroll',exact:true}).click();
  await page.goBack(); await expect(page.getByRole('heading',{name:'Tax codes',exact:true})).toBeVisible();
  await page.getByText('Event reports & history',{exact:true}).click();
  await page.getByRole('button',{name:'Customer balances',exact:true}).click();
  await page.reload(); await expect(page.getByRole('heading',{name:'Customer balances',exact:true})).toBeVisible();
  const before=page.url(); await page.getByRole('link',{name:'Skip to content',exact:true}).press('Enter'); await expect(page).toHaveURL(before);
});
test('accountants receive read-only setup while ordinary accounting actions remain available',async({page})=>{
  await login(page,'accountant'); await dashboard(page).getByRole('button',{name:'Accounting',exact:true}).click(); await tax(page);
  await expect(page.locator('[data-finance-add="tax"],[data-finance-add="company"]')).toHaveCount(0);
  await expect(page.getByText('Owner-managed settings · read only',{exact:true})).toHaveCount(2);
  await expect(page.getByRole('button',{name:'＋ Government obligation',exact:true})).toBeVisible();
  await page.locator('.finance-nav-group summary').getByText('Configuration',{exact:true}).click();
  await page.getByRole('button',{name:'Journals & settings',exact:true}).click();
  await expect(page.locator('[data-finance-add="close"]')).toHaveCount(0);
  await expect(page.locator('[data-finance-add="journal"]')).toBeVisible();
});
test('closed finance editors are removed across workspace and session changes',async({page})=>{
  await login(page); await payroll(page);
  await page.getByRole('button',{name:'Close accounting editor',exact:true}).click();
  await expect(page.locator('dialog.finance-dialog')).toHaveCount(0);
  await dashboard(page).getByRole('button',{name:'Today',exact:true}).click();
  await dashboard(page).getByRole('button',{name:'Accounting',exact:true}).click(); await tax(page);
  await page.getByRole('button',{name:'＋ Tax code',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Add Tax code',exact:true})).toBeVisible();
  await expect(page.locator('dialog.finance-dialog')).toHaveCount(1);
  await page.getByRole('button',{name:'Close accounting editor',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.locator('dialog.finance-dialog')).toHaveCount(0);
});
