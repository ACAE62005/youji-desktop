import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  Database,
  Edit3,
  HelpCircle,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  UploadCloud,
  Wand2,
  XCircle,
  ExternalLink,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import appIconUrl from "./assets/app-icon.png";
import type { AccountCredentialUpdate, AccountRecord, AppSettings, ImportResponse, MailResult, SearchInput, SearchResponse, UpdateStatus } from "../main/types";

type TabId = "search" | "import" | "accounts" | "help" | "about";

const DEFAULT_SETTINGS: AppSettings = {
  defaultLimit: 10,
  defaultKeyword: "",
  requestTimeoutMs: 20000,
  includeSpamOrJunk: false
};

const IMPORT_PLACEHOLDER = "点击这里粘贴账号，每行一条";
const QQ_DOMAINS = new Set(["qq.com", "vip.qq.com", "foxmail.com"]);

function formatDate(value: string | null): string {
  if (!value) {
    return "尚未检测";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function providerName(provider: AccountRecord["provider"]): string {
  if (provider === "outlook") {
    return "Outlook";
  }
  if (provider === "gmail") {
    return "Gmail";
  }
  if (provider === "qq") {
    return "QQ邮箱";
  }
  return "未知";
}

function isQqEmail(email: string): boolean {
  return QQ_DOMAINS.has(email.split("@")[1]?.toLowerCase() ?? "");
}

function accountProviderName(account: AccountRecord): string {
  if (account.provider === "unknown" && isQqEmail(account.email)) {
    return "QQ邮箱";
  }
  return providerName(account.provider);
}

function statusMeta(status: AccountRecord["status"]) {
  if (status === "ok") {
    return { label: "可用", icon: CheckCircle2, className: "statusOk" };
  }
  if (status === "error") {
    return { label: "异常", icon: XCircle, className: "statusError" };
  }
  return { label: "待补凭证", icon: CircleAlert, className: "statusIdle" };
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  async function refreshState() {
    const [nextAccounts, nextSettings] = await Promise.all([window.mailBridge.listAccounts(), window.mailBridge.getSettings()]);
    setAccounts(nextAccounts);
    setSettings(nextSettings);
  }

  useEffect(() => {
    void refreshState().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void window.mailBridge.getAppVersion().then(setAppVersion);
    return window.mailBridge.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.state === "downloaded" && window.confirm(`${status.message}\n\n现在重启安装吗？`)) {
        void window.mailBridge.installUpdate();
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const stats = useMemo(() => {
    const ok = accounts.filter((account) => account.status === "ok").length;
    const error = accounts.filter((account) => account.status === "error").length;
    return { total: accounts.length, ok, error, success: 0 };
  }, [accounts]);

  const showUpdateBanner =
    updateStatus?.state === "available" || updateStatus?.state === "downloading" || updateStatus?.state === "downloaded";

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon appLogo">
            <img src={appIconUrl} alt="" />
          </div>
          <div>
            <strong>邮迹</strong>
            <span>邮迹</span>
          </div>
        </div>

        <nav className="navList" aria-label="主导航">
          <NavButton active={activeTab === "search"} icon={Inbox} label="收件箱" onClick={() => setActiveTab("search")} />
          <NavButton active={activeTab === "import"} icon={UploadCloud} label="批量导入" onClick={() => setActiveTab("import")} />
          <NavButton active={activeTab === "accounts"} icon={Database} label="账号管理" onClick={() => setActiveTab("accounts")} />
          <NavButton active={activeTab === "help"} icon={HelpCircle} label="使用帮助" onClick={() => setActiveTab("help")} />
          <NavButton active={activeTab === "about"} icon={Info} label="关于我们" onClick={() => setActiveTab("about")} />
        </nav>

        <div className="sideSpacer" />

        <section className="statCard" aria-label="使用统计">
          <div className="statTitle">
            <BarChart3 size={16} />
            <span>使用统计</span>
            <button className="miniIconButton" type="button" aria-label="刷新统计" onClick={() => void refreshState()}>
              <RefreshCw size={15} />
            </button>
          </div>
          <StatLine label="账号总数" value={stats.total} />
          <StatLine label="可用账号" value={stats.ok} />
          <StatLine label="接码成功" value={stats.success} />
          <StatLine label="接码失败" value={stats.error} />
        </section>

        <section className="statusCard" aria-label="运行状态">
          <div>
            <span className="statusDot" />
            <strong>运行状态: 正常</strong>
          </div>
          <span>版本: {appVersion}</span>
        </section>
      </aside>

      <main className="mainArea">
        <TopActions onRefresh={() => void refreshState()} onTheme={() => setDark((value) => !value)} />
        {showUpdateBanner && updateStatus && <UpdateBanner status={updateStatus} onInstall={() => void window.mailBridge.installUpdate()} />}
        {loading ? (
          <div className="centerState">
            <Loader2 className="spin" size={28} />
            <span>正在加载本地数据</span>
          </div>
        ) : (
          <>
            {activeTab === "search" && <SearchView accounts={accounts} settings={settings} onAccountsChange={setAccounts} />}
            {activeTab === "import" && (
              <ImportView
                onImported={async () => {
                  await refreshState();
                }}
              />
            )}
            {activeTab === "accounts" && <AccountsView accounts={accounts} onAccountsChange={setAccounts} />}
            {activeTab === "help" && <HelpView />}
            {activeTab === "about" && <AboutView />}
          </>
        )}
      </main>
    </div>
  );
}

function TopActions({
  onRefresh,
  onTheme
}: {
  onRefresh: () => void;
  onTheme: () => void;
}) {
  return (
    <div className="topActions">
      <button type="button" onClick={onRefresh}>
        <RefreshCw size={17} />
        刷新
      </button>
      <button type="button" onClick={onTheme}>
        <Sun size={17} />
        主题
      </button>
    </div>
  );
}

function UpdateBanner({ status, onInstall }: { status: UpdateStatus; onInstall: () => void }) {
  const isError = status.state === "error" || status.state === "disabled";
  const isSuccess = status.state === "downloaded" || status.state === "not-available";
  return (
    <div className={`updateBanner ${isError ? "error" : isSuccess ? "success" : ""}`}>
      {status.state === "checking" || status.state === "downloading" ? <Loader2 className="spin" size={16} /> : <CircleAlert size={16} />}
      <span>{status.message}</span>
      {typeof status.percent === "number" && <strong>{status.percent}%</strong>}
      {status.state === "downloaded" && (
        <button type="button" onClick={onInstall}>
          重启安装
        </button>
      )}
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button className={`navButton ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="statLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="pageHeader">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function SearchView({
  accounts,
  settings,
  onAccountsChange
}: {
  accounts: AccountRecord[];
  settings: AppSettings;
  onAccountsChange: (accounts: AccountRecord[]) => void;
}) {
  const [scope, setScope] = useState<SearchInput["accountScope"]>("all");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [keyword, setKeyword] = useState(settings.defaultKeyword);
  const [limit, setLimit] = useState(settings.defaultLimit);
  const [includeSpamOrJunk, setIncludeSpamOrJunk] = useState(settings.includeSpamOrJunk);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    try {
      const result = await window.mailBridge.searchMail({
        accountScope: scope,
        selectedEmails,
        keyword,
        limit,
        includeSpamOrJunk
      });
      setResponse(result);
      setLastUpdated(new Date().toISOString());
      onAccountsChange(await window.mailBridge.listAccounts());
    } finally {
      setLoading(false);
    }
  }

  const usableAccounts = accounts.filter((account) => account.status === "ok");
  const canSearch = usableAccounts.length > 0 && (scope === "all" || selectedEmails.length > 0);
  const selectedLabel = scope === "all" ? "全部可用账号" : selectedEmails.length > 0 ? `${selectedEmails.length} 个指定账号` : "未选择账号";

  return (
    <section className="page searchPage">
      <PageHeader title="收件箱" subtitle="从已授权邮箱读取最新邮件，按关键词筛选并自动提取验证码。" />

      <div className="toolbarPanel">
        <label className="field scopeField">
          <span>账号范围</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as SearchInput["accountScope"])}>
            <option value="all">全部可用账号</option>
            <option value="selected">指定账号</option>
          </select>
        </label>

        <label className="field keywordField">
          <span>关键词</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.currentTarget.value)}
            onInput={(event) => setKeyword(event.currentTarget.value)}
            placeholder="标题或正文关键词"
            autoComplete="off"
          />
        </label>

        <label className="field limitField">
          <span>每个账号</span>
          <input type="number" min={1} max={50} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
        </label>

        <label className="checkField">
          <input checked={includeSpamOrJunk} type="checkbox" onChange={(event) => setIncludeSpamOrJunk(event.target.checked)} />
          <span>包含垃圾邮件</span>
        </label>

        <button className="primaryButton searchButton" disabled={!canSearch || loading} onClick={runSearch}>
          {loading ? <Loader2 className="spin" size={19} /> : <Search size={19} />}
          <span>{loading ? "获取中" : "获取邮件"}</span>
        </button>
      </div>

      {scope === "selected" && (
        <div className="accountSelector" aria-label="选择账号">
          {usableAccounts.map((account) => (
            <label key={account.email} className="accountPill">
              <input
                type="checkbox"
                checked={selectedEmails.includes(account.email)}
                onChange={(event) => {
                  setSelectedEmails((current) =>
                    event.target.checked ? [...current, account.email] : current.filter((email) => email !== account.email)
                  );
                }}
              />
              <span>{account.email}</span>
            </label>
          ))}
        </div>
      )}

      <div className="contentCard">
        {!response ? (
          <EmptyState icon={Inbox} title="还没有查询结果" text="导入 OAuth 可用的账号后，输入关键词或直接获取最近邮件。" />
        ) : (
          <ResultsView results={response.results} errors={response.errors} />
        )}
      </div>

      <div className="resultBar">
        <span>已选择账号：{selectedLabel}</span>
        <span>关键词：{keyword.trim() || "-"}</span>
        <span>最后更新：{lastUpdated ? formatDate(lastUpdated) : "-"}</span>
        <button className="secondaryButton compactButton" type="button" onClick={() => setResponse(null)} disabled={!response}>
          <Trash2 size={16} />
          清空结果
        </button>
      </div>
    </section>
  );
}

function ResultsView({ results, errors }: SearchResponse) {
  return (
    <div className="resultsLayout">
      {errors.length > 0 && (
        <div className="notice errorNotice">
          <CircleAlert size={18} />
          <span>{errors.length} 个账号读取失败，可到账号管理查看原因。</span>
        </div>
      )}

      {results.length === 0 ? (
        <EmptyState icon={Search} title="没有找到邮件" text="可以换一个关键词，或提高每个账号读取数量。" />
      ) : (
        <div className="resultList">
          {results.map((mail, index) => (
            <MailRow key={`${mail.email}-${mail.receivedAt}-${index}`} mail={mail} />
          ))}
        </div>
      )}
    </div>
  );
}

function MailRow({ mail }: { mail: MailResult }) {
  return (
    <article className="mailRow">
      <div className="mailMeta">
        <span className="providerBadge">{providerName(mail.provider)}</span>
        <strong>{mail.email}</strong>
        <span>{formatDate(mail.receivedAt)}</span>
      </div>
      <div className="mailMain">
        <div>
          <h2>{mail.subject || "无标题邮件"}</h2>
          <p>{mail.from || "未知发件人"}</p>
          <span>{mail.snippet || "无正文片段"}</span>
        </div>
        <div className={`codeBox ${mail.code ? "hasCode" : ""}`}>
          <span>验证码</span>
          <strong>{mail.code ?? "未识别"}</strong>
        </div>
      </div>
    </article>
  );
}

function ImportView({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await window.mailBridge.importAccounts(text);
      setResult(response);
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function pasteFromClipboard() {
    const clipboardText = await navigator.clipboard.readText();
    setText((current) => (current.trim() ? `${current.trim()}\n${clipboardText.trim()}` : clipboardText.trim()));
  }

  return (
    <section className="page standardPage">
      <PageHeader title="批量导入" subtitle="支持 QQ 邮箱授权码，也支持导入 Outlook/Gmail OAuth 凭证并检测账号可用性。" />

      <div className="importGrid">
        <div className="formPanel">
          <label className="field block">
            <span>账号文本</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} placeholder={IMPORT_PLACEHOLDER} />
          </label>
          <div className="hintLine">QQ 格式：qq邮箱----授权码；Outlook/Gmail 格式：email----password----client_id----refresh_token。</div>
          <div className="inlineActions">
            <button className="secondaryButton" type="button" onClick={pasteFromClipboard}>
              <Clipboard size={16} />
              粘贴剪贴板
            </button>
            <button className="secondaryButton" type="button" onClick={() => setText("")} disabled={!text}>
              <Trash2 size={16} />
              清空
            </button>
          </div>
          <button className="primaryButton" disabled={!text.trim() || loading} onClick={submit}>
            {loading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
            <span>{loading ? "导入中" : "开始导入"}</span>
          </button>
          {loading && (
            <div className="notice infoNotice">
              <Loader2 className="spin" size={18} />
              <span>正在导入并检测账号，OAuth 检测可能需要十几秒。</span>
            </div>
          )}
          {error && (
            <div className="notice errorNotice">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}
          {result && (
            <div className={result.failed > 0 ? "notice errorNotice" : "notice successNotice"}>
              <CircleAlert size={18} />
              <span>
                导入完成：保存 {result.imported} 条，失败 {result.failed} 条。可到账号管理查看状态。
              </span>
            </div>
          )}
        </div>

        <GmailRfTool
          onUseLine={(line) => {
            setText((current) => (current.trim() ? `${current.trim()}\n${line}` : line));
          }}
        />
      </div>

      {result && (
        <div className="resultList">
          {result.results.map((item) => (
            <div className="importResult" key={`${item.line}-${item.email}`}>
              <span className={item.status === "error" ? "dotError" : item.status === "saved" ? "dotWarn" : "dotOk"} />
              <strong>第 {item.line} 行</strong>
              <span>{item.email || "未解析邮箱"}</span>
              <small>{item.message}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GmailRfTool({ onUseLine }: { onUseLine: (line: string) => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ email: string; refreshToken: string; line: string } | null>(null);
  const generationId = useRef(0);

  async function generate() {
    const currentId = generationId.current + 1;
    generationId.current = currentId;
    setLoading(true);
    setError("");
    setResult(null);
    const timer = window.setTimeout(() => {
      if (generationId.current === currentId) {
        generationId.current += 1;
        setLoading(false);
        setError("授权等待超时。如果网页显示授权失败，请按网页提示修正后再试。");
      }
    }, 60000);
    try {
      const token = await window.mailBridge.generateGmailRefreshToken({ clientId, clientSecret });
      if (generationId.current !== currentId) {
        return;
      }
      const email = token.email || "your_gmail@gmail.com";
      const line = clientSecret.trim()
        ? `${email}----mail_password----${clientId.trim()}----${clientSecret.trim()}----${token.refreshToken}`
        : `${email}----mail_password----${clientId.trim()}----${token.refreshToken}`;
      setResult({ email, refreshToken: token.refreshToken, line });
    } catch (caught) {
      if (generationId.current === currentId) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      window.clearTimeout(timer);
      if (generationId.current === currentId) {
        setLoading(false);
      }
    }
  }

  function stopWaiting() {
    generationId.current += 1;
    setLoading(false);
    setError("已停止等待授权。网页如果显示授权失败，请按网页提示修正后再重新生成。");
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="sidePanel rfTool">
      <h2>生成 Gmail RF</h2>
      <div className="rfGrid">
        <label className="field">
          <span>client_id</span>
          <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Google 客户端 ID" />
        </label>
        <label className="field">
          <span>client_secret</span>
          <input value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Google 客户端密钥" />
        </label>
        <button className="primaryButton" disabled={!clientId.trim() || loading} onClick={generate}>
          {loading ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
          <span>{loading ? "等待授权" : "打开授权生成 RF"}</span>
        </button>
      </div>
      {loading && (
        <button className="secondaryButton stopButton" type="button" onClick={stopWaiting}>
          停止等待
        </button>
      )}
      <p>会打开 Google 登录页，选择已添加为测试用户的 Gmail，授权后自动回到软件。</p>
      {error && (
        <div className="notice errorNotice">
          <CircleAlert size={18} />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="generatedBox">
          <span>生成成功：{result.email}</span>
          <code>{result.line}</code>
          <div className="inlineActions">
            <button className="secondaryButton" onClick={() => copy(result.refreshToken)}>
              <Clipboard size={16} />
              复制 RF
            </button>
            <button className="secondaryButton" onClick={() => onUseLine(result.line)}>
              <UploadCloud size={16} />
              填入导入框
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsView({ accounts, onAccountsChange }: { accounts: AccountRecord[]; onAccountsChange: (accounts: AccountRecord[]) => void }) {
  const [checking, setChecking] = useState<string | null>(null);
  const [errorAccount, setErrorAccount] = useState<AccountRecord | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  async function recheck(email: string) {
    setChecking(email);
    try {
      await window.mailBridge.checkAccount(email);
      onAccountsChange(await window.mailBridge.listAccounts());
    } finally {
      setChecking(null);
    }
  }

  async function remove(email: string) {
    if (!window.confirm(`确定删除 ${email} 吗？`)) {
      return;
    }
    onAccountsChange(await window.mailBridge.deleteAccount(email));
  }

  async function saveAccount(input: AccountCredentialUpdate) {
    setSavingAccount(true);
    try {
      onAccountsChange(await window.mailBridge.updateAccount(input));
      setEditingAccount(null);
    } finally {
      setSavingAccount(false);
    }
  }

  return (
    <section className="page standardPage">
      <PageHeader title="账号管理" subtitle="查看账号状态，重新检测邮箱凭证可用性，或删除不再使用的账号。" />

      {accounts.length === 0 ? (
        <div className="contentCard">
          <EmptyState icon={Database} title="账号池为空" text="先到批量导入页面添加 QQ、Outlook 或 Gmail 账号。" />
        </div>
      ) : (
        <div className="accountList">
          {accounts.map((account) => {
            const meta = statusMeta(account.status);
            const StatusIcon = meta.icon;
            return (
              <article className="accountCard" key={account.email}>
                <div className="accountIdentity">
                  <strong>{account.email}</strong>
                  <span>{accountProviderName(account)}</span>
                </div>
                <span className={`statusBadge ${meta.className}`}>
                  <StatusIcon size={15} />
                  {meta.label}
                </span>
                <div className="accountMeta">
                  <span>最近检测</span>
                  <strong>{formatDate(account.lastCheckedAt)}</strong>
                </div>
                <div className="accountError">
                  <span>{account.errorMessage ? shortError(account.errorMessage) : "无错误"}</span>
                  {account.errorMessage && (
                    <button className="textButton" type="button" onClick={() => setErrorAccount(account)}>
                      查看错误
                    </button>
                  )}
                </div>
                <div className="rowActions">
                  <button className="iconButton" aria-label="修正账号凭证" onClick={() => setEditingAccount(account)}>
                    <Edit3 size={16} />
                  </button>
                  <button className="iconButton" aria-label="重新检测账号" onClick={() => recheck(account.email)} disabled={checking === account.email}>
                    {checking === account.email ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                  </button>
                  <button className="iconButton danger" aria-label="删除账号" onClick={() => remove(account.email)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {errorAccount && (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="errorDialogTitle">
          <div className="errorDialog">
            <div className="dialogHeader">
              <div>
                <h2 id="errorDialogTitle">账号错误详情</h2>
                <p>{errorAccount.email}</p>
              </div>
              <button className="secondaryButton compactButton" type="button" onClick={() => setErrorAccount(null)}>
                关闭
              </button>
            </div>
            <pre>{errorAccount.errorMessage}</pre>
          </div>
        </div>
      )}

      {editingAccount && (
        <AccountEditDialog
          account={editingAccount}
          saving={savingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={saveAccount}
        />
      )}
    </section>
  );
}

function shortError(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.includes("AADSTS700016")) {
    return "Microsoft 应用 ID 不存在或租户不匹配";
  }
  if (compact.includes("invalid_client")) {
    return "client_id 或 client_secret 无效";
  }
  if (compact.includes("invalid_grant")) {
    return "refresh_token 无效或已过期";
  }
  if (/QQ 邮箱登录失败|AUTHENTICATIONFAILED|LOGIN/i.test(compact)) {
    return "QQ 邮箱授权码无效或未开启 IMAP";
  }
  return compact.length > 46 ? `${compact.slice(0, 46)}...` : compact;
}

function AccountEditDialog({
  account,
  saving,
  onClose,
  onSave
}: {
  account: AccountRecord;
  saving: boolean;
  onClose: () => void;
  onSave: (input: AccountCredentialUpdate) => Promise<void>;
}) {
  const [form, setForm] = useState<AccountCredentialUpdate>({
    email: account.email,
    password: "",
    clientId: account.clientId,
    clientSecret: "",
    refreshToken: ""
  });
  const isQqAccount = account.provider === "qq" || isQqEmail(account.email);

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="editDialogTitle">
      <form
        className="editDialog"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <div className="dialogHeader">
          <div>
            <h2 id="editDialogTitle">修正账号凭证</h2>
            <p>{account.email} · {accountProviderName(account)}</p>
          </div>
          <button className="secondaryButton compactButton" type="button" onClick={onClose} disabled={saving}>
            关闭
          </button>
        </div>

        <div className="editNotice">
          <CircleAlert size={17} />
          <span>{isQqAccount ? "QQ 授权码不会明文回显；留空时会保留原授权码。" : "密码、client_secret、refresh_token 不会明文回显；对应输入框留空时会保留原值。"}</span>
        </div>

        {isQqAccount ? (
          <div className="editGrid qqEditGrid">
            <label className="field">
              <span>邮箱</span>
              <input value={form.email} readOnly />
            </label>
            <label className="field">
              <span>QQ授权码</span>
              <input
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="留空保持原授权码"
                type="password"
              />
            </label>
            <div className="editWide qqAuthHint">
              <strong>QQ 邮箱只需要授权码</strong>
              <span>如果重新检测失败，请先到 QQ 邮箱网页版确认已开启 IMAP/SMTP 服务，再复制新授权码填到这里。</span>
            </div>
          </div>
        ) : (
          <div className="editGrid">
            <label className="field">
              <span>邮箱</span>
              <input value={form.email} readOnly />
            </label>
            <label className="field">
              <span>邮箱密码</span>
              <input
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="留空保持原密码"
                type="password"
              />
            </label>
            <label className="field">
              <span>client_id</span>
              <input value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} placeholder="OAuth 应用 client_id" />
            </label>
            <label className="field">
              <span>client_secret</span>
              <input
                value={form.clientSecret}
                onChange={(event) => setForm({ ...form, clientSecret: event.target.value })}
                placeholder={account.hasClientSecret ? "留空保持原 client_secret" : "没有可留空"}
                type="password"
              />
            </label>
            <label className="field editWide">
              <span>refresh_token</span>
              <textarea
                value={form.refreshToken}
                onChange={(event) => setForm({ ...form, refreshToken: event.target.value })}
                placeholder="留空保持原 refresh_token；如果换了 client_id，通常也要换同一应用生成的 refresh_token"
                spellCheck={false}
              />
            </label>
          </div>
        )}

        <div className="dialogActions">
          <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="primaryButton" type="submit" disabled={saving || (!isQqAccount && !String(form.clientId ?? "").trim())}>
            {saving ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
            <span>{saving ? "保存并检测中" : "保存并重新检测"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function HelpView() {
  return (
    <section className="page standardPage">
      <PageHeader title="使用帮助" subtitle="这里集中说明账号格式、Gmail、Outlook/Microsoft 的凭证获取方式，以及导入后的使用流程。" />

      <div className="helpManual">
        <HelpSection title="一、导入格式">
          <p>批量导入页每行填写一个账号。邮迹识别邮箱后会自动判断 QQ、Gmail、Outlook/Hotmail/Live 或未知邮箱类型。</p>
          <div className="formatExamples">
            <div>
              <strong>QQ 邮箱授权码格式</strong>
              <code>qq邮箱----授权码</code>
            </div>
            <div>
              <strong>卖家常见四段格式</strong>
              <code>email----password----client_id----refresh_token</code>
            </div>
            <div>
              <strong>带 client_secret 的五段格式</strong>
              <code>email----password----client_id----client_secret----refresh_token</code>
            </div>
            <div>
              <strong>只先保存账号密码</strong>
              <code>email----password</code>
            </div>
          </div>
          <p className="helpNote">QQ 邮箱第二段必须填授权码，不是 QQ 登录密码。Outlook/Gmail 仍需要补齐 OAuth 的 client_id 和 refresh_token。</p>
        </HelpSection>

        <HelpSection title="二、QQ 邮箱获取方式">
          <div className="helpSplit">
            <ol className="stepList">
              <li>登录 QQ 邮箱网页版。</li>
              <li>进入“设置”，找到“账号”或“POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务”。</li>
              <li>开启 IMAP/SMTP 服务，并按页面提示验证。</li>
              <li>复制生成的授权码。</li>
              <li>回到批量导入页，按“qq邮箱----授权码”粘贴导入。</li>
            </ol>
            <div className="flowCard">
              <strong>QQ 邮箱流程</strong>
              <span>邮箱设置</span>
              <span>开启 IMAP/SMTP</span>
              <span>生成授权码</span>
              <span>导入邮迹</span>
            </div>
          </div>
        </HelpSection>

        <HelpSection title="三、Gmail 获取方式">
          <div className="helpSplit">
            <ol className="stepList">
              <li>打开 Google Cloud Console，进入“API 和服务”。</li>
              <li>启用 Gmail API。</li>
              <li>配置 OAuth 同意屏幕；如果应用处于测试状态，把要授权的 Gmail 加进测试用户。</li>
              <li>在“凭据”里创建 OAuth 客户端 ID，应用类型选择桌面应用或适合本机回调的客户端。</li>
              <li>复制 client_id；如果后台给了 client_secret，也一起保留。</li>
              <li>回到邮迹的“批量导入”，在“生成 Gmail RF”里填 client_id/client_secret，点击授权生成 refresh_token。</li>
              <li>生成成功后，点击“填入导入框”，再执行导入。</li>
            </ol>
            <div className="flowCard">
              <strong>Gmail 流程</strong>
              <span>Google Cloud</span>
              <span>启用 Gmail API</span>
              <span>创建 OAuth 客户端</span>
              <span>邮迹生成 RF</span>
            </div>
          </div>
          <div className="helpLinks">
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Google Cloud 凭据
            </a>
          </div>
        </HelpSection>

        <HelpSection title="四、Outlook / Hotmail / Live 获取方式">
          <div className="helpSplit">
            <ol className="stepList">
              <li>打开 Microsoft Entra 管理中心，进入“应用注册”。</li>
              <li>新建应用注册，账号类型按你的邮箱来源选择个人 Microsoft 账号或组织账号。</li>
              <li>在“身份验证”里配置重定向 URI。使用本地工具时，通常使用本机回调地址或桌面/移动客户端类型。</li>
              <li>在“API 权限”里添加 Microsoft Graph 邮件读取权限，例如 Mail.Read，并按需要完成管理员同意。</li>
              <li>复制应用的 client_id。若你配置了客户端密码，也保留 client_secret。</li>
              <li>通过你的 Outlook OAuth 授权流程生成 refresh_token。</li>
              <li>按四段或五段格式粘贴到批量导入页。</li>
            </ol>
            <div className="flowCard microsoft">
              <strong>Microsoft 流程</strong>
              <span>Entra 应用注册</span>
              <span>配置重定向 URI</span>
              <span>添加 Graph 权限</span>
              <span>生成 refresh_token</span>
            </div>
          </div>
          <div className="helpLinks">
            <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Microsoft Entra 应用注册
            </a>
          </div>
        </HelpSection>

        <HelpSection title="五、卖家直接给号时怎么问">
          <p>如果你购买的是已经配好的接码邮箱，最省事的方式是让卖家直接给完整导入行。</p>
          <div className="formatExamples">
            <div>
              <strong>QQ 邮箱格式</strong>
              <code>邮箱----授权码</code>
            </div>
            <div>
              <strong>Outlook/Gmail 格式</strong>
              <code>邮箱----邮箱密码----client_id----refresh_token</code>
            </div>
          </div>
          <p className="helpNote">QQ 邮箱一定要授权码。Outlook/Gmail 如果卖家额外提供 client_secret，就按五段格式导入。</p>
        </HelpSection>

        <HelpSection title="六、导入后怎么查验证码">
          <ol className="stepList compact">
            <li>进入“账号管理”，确认账号状态是“可用”。</li>
            <li>进入“收件箱”，选择全部可用账号或指定账号。</li>
            <li>关键词可以填平台名、验证码、verify、code，也可以留空直接读取最近邮件。</li>
            <li>点击“获取邮件”，结果区会显示邮件和识别到的验证码。</li>
          </ol>
        </HelpSection>
      </div>
    </section>
  );
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="helpSection">
      <h2>{title}</h2>
      <div className="helpBody">{children}</div>
    </article>
  );
}

function AboutView() {
  return (
    <section className="page standardPage">
      <PageHeader title="关于我们" subtitle="邮迹是一个本地运行的邮箱验证码管理工具，专注账号导入、邮件读取与验证码提取。" />
      <div className="contentCard aboutCard">
        <div className="brandIcon appLogo large">
          <img src={appIconUrl} alt="" />
        </div>
        <h2>邮迹</h2>
        <p>所有账号数据保存在本机，用于批量管理 OAuth 邮箱并快速查询验证码邮件。</p>
      </div>
    </section>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="infoCard">
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="emptyState">
      <div className="emptyIllustration">
        <Icon size={58} />
        <span className="spark one" />
        <span className="spark two" />
        <span className="spark three" />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

export default App;
