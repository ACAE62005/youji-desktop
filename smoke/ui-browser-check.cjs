const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

async function waitForDevServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
  const vite = spawn("cmd.exe", ["/c", "node_modules\\.bin\\vite.cmd", "--host", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true
  });

  let browser;
  try {
    await waitForDevServer("http://127.0.0.1:5173");
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
    const page = await browser.newPage({ viewport: { width: 1220, height: 780 } });
    await page.addInitScript(() => {
      window.mailBridge = {
        listAccounts: async () => [
          {
            email: "jaxtira300545+cfirmwvy@outlook.com",
            provider: "outlook",
            clientId: "demo",
            hasClientSecret: true,
            status: "ok",
            lastCheckedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage: null
          },
          {
            email: "1620282823@qq.com",
            provider: "unknown",
            clientId: "",
            hasClientSecret: false,
            status: "unchecked",
            lastCheckedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage: "历史未知账号"
          },
          {
            email: "broken@example.com",
            provider: "unknown",
            clientId: "1gl4jar3",
            hasClientSecret: false,
            status: "error",
            lastCheckedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage:
              "AADSTS700016: Application with identifier '1gl4jar3' was not found in the directory 'Microsoft Accounts'. This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant."
          }
        ],
        importAccounts: async () => ({ imported: 1, failed: 0, results: [] }),
        updateAccount: async () => [],
        checkAccount: async () => ({ ok: true, message: "ok" }),
        deleteAccount: async () => [],
        clearAccounts: async () => [],
        searchMail: async () => ({
          results: [
            {
              email: "jaxtira300545+cfirmwvy@outlook.com",
              provider: "outlook",
              subject: "OpenAI - Access Deactivated [C-1v62nayXJ91S]",
              from: "trustandsafety@tm.openai.com",
              receivedAt: "2026-06-08T12:59:00.000Z",
              code: null,
              snippet: "Access deactivated Hello, We are writing with an important update about your ChatGPT account associated with this address..."
            }
          ],
          errors: []
        }),
        generateGmailRefreshToken: async () => ({ email: "demo@gmail.com", refreshToken: "rf", accessToken: "at" }),
        getSettings: async () => ({ defaultLimit: 10, defaultKeyword: "", requestTimeoutMs: 20000, includeSpamOrJunk: false }),
        saveSettings: async (settings) => settings
      };
    });
    await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
    const keywordInput = page.getByPlaceholder("标题或正文关键词");
    await keywordInput.fill("OpenAI");
    const keywordValue = await keywordInput.inputValue();
    await page.locator("select").selectOption("selected");
    await page.locator(".accountSelector input").first().check();
    await page.getByText("获取邮件", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.resolve(__dirname, "youji-ui.png"), fullPage: true });
    const bodyText = await page.locator("body").innerText();
    const searchMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      contentCardClientHeight: document.querySelector(".contentCard")?.clientHeight ?? 0,
      contentCardScrollHeight: document.querySelector(".contentCard")?.scrollHeight ?? 0,
      selectorBottom: Math.round(document.querySelector(".accountSelector")?.getBoundingClientRect().bottom ?? 0),
      contentTop: Math.round(document.querySelector(".contentCard")?.getBoundingClientRect().top ?? 0)
    }));
    await page.getByText("批量导入", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.resolve(__dirname, "youji-import-ui.png"), fullPage: true });
    const importMetrics = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      pageClientHeight: document.querySelector(".standardPage")?.clientHeight ?? 0,
      pageScrollHeight: document.querySelector(".standardPage")?.scrollHeight ?? 0
    }));
    await page.getByText("使用帮助", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.resolve(__dirname, "youji-help-ui.png"), fullPage: true });
    const helpText = await page.locator("body").innerText();
    await page.getByText("账号管理", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.locator(".accountCard", { hasText: "1620282823@qq.com" }).getByLabel("修正账号凭证").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(__dirname, "youji-accounts-ui.png"), fullPage: true });
    const editDialogText = await page.locator(".editDialog").innerText();
    const accountMetrics = await page.evaluate(() => ({
      accountCardHeights: Array.from(document.querySelectorAll(".accountCard")).map((item) => item.clientHeight),
      actionBounds: Array.from(document.querySelectorAll(".accountCard")).map((card) => {
        const actions = card.querySelector(".rowActions");
        const cardBox = card.getBoundingClientRect();
        const actionsBox = actions?.getBoundingClientRect();
        return {
          cardRight: Math.round(cardBox.right),
          actionsRight: Math.round(actionsBox?.right ?? 0),
          clipped: actionsBox ? actionsBox.right > cardBox.right : true
        };
      }),
      hasErrorDialogButton: document.body.innerText.includes("查看错误"),
      hasEditDialog: document.body.innerText.includes("修正账号凭证")
    }));
    accountMetrics.qqDialogIsSimplified = editDialogText.includes("QQ授权码") && !editDialogText.includes("client_id") && !editDialogText.includes("refresh_token");
    console.log(JSON.stringify({
      title: await page.title(),
      hasBrand: bodyText.includes("邮迹"),
      hasInbox: bodyText.includes("收件箱"),
      hasSettingsEntry: bodyText.includes("设置中心"),
      keywordValue,
      hasQqHelp: helpText.includes("QQ 邮箱获取方式"),
      hasGmailHelp: helpText.includes("Gmail 获取方式"),
      hasMicrosoftHelp: helpText.includes("Outlook / Hotmail / Live 获取方式"),
      searchMetrics,
      importMetrics,
      accountMetrics
    }));
  } finally {
    if (browser) {
      await browser.close();
    }
    vite.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
