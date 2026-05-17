const qs = (s, c = document) => c.querySelector(s);
const qsa = (s, c = document) => [...c.querySelectorAll(s)];
const sb = window.caminfoSupabase;

let orders = [];
let reviews = [];
let notifications = [];
let charts = {};
let realtimeBound = false;

function toast(msg) {
  const el = qs("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3500);
}

function escapeHtml(s = "") {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

function fmtDate(s) {
  return new Date(s).toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" });
}

function csvEscape(v) {
  return `"${String(v ?? "").replaceAll('"', '""')}"`;
}

async function requireAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = "login.html";
    return null;
  }

  const { data, error } = await sb.from("admin_users").select("id,email,role").limit(1);
  if (error || !data?.length) {
    await sb.auth.signOut();
    location.href = "login.html";
    return null;
  }

  await logLogin(session.user);
  return session.user;
}

async function logLogin(user) {
  try {
    await sb.from("admin_login_events").insert({
      user_id: user.id,
      email: user.email,
      user_agent: navigator.userAgent
    });
  } catch (e) {}
}

function initNav() {
  qsa(".side-nav button").forEach((btn) => btn.addEventListener("click", () => {
    qsa(".side-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    qsa(".panel-section").forEach((s) => s.classList.remove("active"));
    qs("#" + btn.dataset.section)?.classList.add("active");

    qs("#sectionTitle").textContent = btn.textContent;
    qs("#sidebar")?.classList.remove("active");
    qs("#sidebarToggle")?.classList.remove("active");
  }));

  qs("#sidebarToggle")?.addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("active");
    qs("#sidebar")?.classList.toggle("active");
  });

  qs("#logoutBtn")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "login.html";
  });
}

async function refreshAll() {
  await Promise.all([loadAnalytics(), loadOrders(), loadReviews(), loadNotifications()]);
}

async function loadAnalytics() {
  const since24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { data: pv24 },
    { data: pv7 },
    { data: o30 },
    { data: lToday },
    { data: daily },
    { data: oDaily },
    { data: rDaily }
  ] = await Promise.all([
    sb.from("page_views").select("visitor_id").gte("created_at", since24),
    sb.from("page_views").select("id,visitor_id,created_at").gte("created_at", since7),
    sb.from("orders").select("id,total_price,created_at").gte("created_at", since30),
    sb.from("admin_login_events").select("id").gte("created_at", today.toISOString()),
    sb.from("analytics_daily").select("*").limit(14),
    sb.from("analytics_orders_daily").select("*").limit(14),
    sb.from("analytics_reviews_daily").select("*").limit(14)
  ]);

  qs("#visitors24").textContent = new Set((pv24 || []).map((x) => x.visitor_id)).size;
  qs("#views7d").textContent = (pv7 || []).length;
  qs("#orders1m").textContent = (o30 || []).length;
  qs("#loginsToday").textContent = (lToday || []).length;

  renderTraffic((daily || []).reverse());
  renderOrdersChart((oDaily || []).reverse());
  renderReviewsChart((rDaily || []).reverse());
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#f5f7ff" } },
      tooltip: { enabled: true }
    },
    scales: {
      x: { ticks: { color: "#b7bfdd" }, grid: { color: "rgba(255,255,255,.06)" } },
      y: { ticks: { color: "#b7bfdd" }, grid: { color: "rgba(255,255,255,.06)" }, beginAtZero: true }
    }
  };
}

function renderTraffic(rows) {
  const el = qs("#trafficChart");
  if (!el) return;
  charts.traffic?.destroy();
  charts.traffic = new Chart(el, {
    type: "line",
    data: {
      labels: rows.map((r) => r.day),
      datasets: [
        { label: "Page Views", data: rows.map((r) => r.page_views), borderColor: "#00e8ff", backgroundColor: "rgba(0,232,255,.13)", tension: 0.42, fill: true },
        { label: "Visitors", data: rows.map((r) => r.unique_visitors), borderColor: "#ff2e9b", backgroundColor: "rgba(255,46,155,.12)", tension: 0.42, fill: true }
      ]
    },
    options: chartOptions()
  });
}

function renderOrdersChart(rows) {
  const el = qs("#ordersChart");
  if (!el) return;
  charts.orders?.destroy();
  charts.orders = new Chart(el, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.day),
      datasets: [{ label: "Orders", data: rows.map((r) => r.orders_count), backgroundColor: "rgba(143,56,255,.72)", borderRadius: 12 }]
    },
    options: chartOptions()
  });
}

function renderReviewsChart(rows) {
  const el = qs("#reviewsChart");
  if (!el) return;
  charts.reviews?.destroy();
  charts.reviews = new Chart(el, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.day),
      datasets: [
        { label: "Pending", data: rows.map((r) => r.pending_reviews), backgroundColor: "rgba(255,215,106,.68)", borderRadius: 12 },
        { label: "Approved", data: rows.map((r) => r.approved_reviews), backgroundColor: "rgba(146,255,139,.55)", borderRadius: 12 }
      ]
    },
    options: chartOptions()
  });
}

async function loadOrders() {
  let query = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
  const status = qs("#orderStatusFilter")?.value;
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    toast(error.message);
    return;
  }

  orders = data || [];
  renderOrders();
}

function renderOrders() {
  qs("#ordersTable").innerHTML = orders.map((o) => `<tr><td>${fmtDate(o.created_at)}</td><td>${escapeHtml(o.customer_name)}</td><td>${escapeHtml(o.phone)}</td><td>${escapeHtml(o.city)}</td><td>${escapeHtml(o.address)}</td><td>${escapeHtml(o.pad_choice)}</td><td>${o.quantity}</td><td>${o.total_price} ${o.currency}</td><td><select class="status-select" data-id="${o.id}">${["new", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td><td><button class="btn btn-danger delete-order" data-id="${o.id}" type="button">×</button></td></tr>`).join("");
}

function initOrders() {
  qs("#orderStatusFilter")?.addEventListener("change", loadOrders);

  qs("#ordersTable")?.addEventListener("change", async (e) => {
    const sel = e.target.closest(".status-select");
    if (!sel) return;

    const { error } = await sb.from("orders").update({ status: sel.value }).eq("id", sel.dataset.id);
    if (error) toast(error.message);
    else toast("Order updated");
  });

  qs("#ordersTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".delete-order");
    if (!btn) return;

    if (!confirm("واش نتا متأكد باغي تمسح هاد الطلب؟ لا يمكن التراجع.")) return;

    const { error } = await sb.from("orders").delete().eq("id", btn.dataset.id);
    if (error) {
      toast(error.message);
      return;
    }

    toast("Order deleted");
    loadOrders();
    loadAnalytics();
  });

  qs("#clearOrdersBtn")?.addEventListener("click", async () => {
    if (!confirm("واش متأكد باغي تمسح كاع الطلبات؟ لا يمكن التراجع.")) return;

    const { error } = await sb.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast(error.message);
      return;
    }

    toast("Orders cleared");
    loadOrders();
    loadAnalytics();
  });

  qs("#exportOrdersBtn")?.addEventListener("click", () => {
    const headers = ["الاسم", "المدينة", "العنوان", "الهاتف"];
    const rows = orders.map((o) => [o.customer_name, o.city, o.address, o.phone]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `kaminfo-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  });
}

async function loadReviews() {
  const { data, error } = await sb.from("reviews").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    toast(error.message);
    return;
  }

  reviews = data || [];
  renderReviews();
}

function renderReviews() {
  qs("#reviewsAdminGrid").innerHTML = reviews.map((r) => {
    const approveButton = r.status === "approved" ? "" : `<button class="btn btn-success review-approve" data-id="${r.id}" type="button">Approve</button>`;
    const rejectButton = r.status === "rejected" ? "" : `<button class="btn btn-danger review-reject" data-id="${r.id}" type="button">Reject</button>`;

    return `<article class="review-card glass"><span class="eyebrow">${escapeHtml(r.status)}</span><h3>${escapeHtml(r.customer_name)} ${r.city ? " - " + escapeHtml(r.city) : ""}</h3><strong>${r.emoji || ""} ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</strong><p>${escapeHtml(r.review_text)}</p><small>${fmtDate(r.created_at)}</small><div class="review-actions">${approveButton}${rejectButton}<button class="btn btn-danger review-delete" data-id="${r.id}" type="button">×</button></div></article>`;
  }).join("");
}

function initReviews() {
  qs("#reviewsAdminGrid")?.addEventListener("click", async (e) => {
    const approve = e.target.closest(".review-approve");
    const reject = e.target.closest(".review-reject");
    const del = e.target.closest(".review-delete");

    if (!approve && !reject && !del) return;

    const id = (approve || reject || del).dataset.id;

    if (del) {
      if (!confirm("واش متأكد باغي تمسح التقييم؟ لا يمكن التراجع.")) return;

      const { error } = await sb.from("reviews").delete().eq("id", id);
      if (error) {
        toast(error.message);
        return;
      }

      toast("Review deleted");
      loadReviews();
      loadAnalytics();
      return;
    }

    const { error } = await sb
      .from("reviews")
      .update({ status: approve ? "approved" : "rejected" })
      .eq("id", id);

    if (error) toast(error.message);
    else {
      toast(approve ? "Review approved" : "Review rejected");
      loadReviews();
      loadAnalytics();
    }
  });
}

async function loadNotifications() {
  const { data, error } = await sb.from("notification_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return;

  notifications = data || [];
  qs("#notificationsTable").innerHTML = notifications.map((n) => `<tr><td>${fmtDate(n.created_at)}</td><td>${escapeHtml(n.event_type)}</td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.body)}</td><td>${n.is_sent ? "Yes" : "No"}</td><td><button class="btn btn-danger delete-notification" data-id="${n.id}" type="button">×</button></td></tr>`).join("");
}

function bindRealtime() {
  if (realtimeBound) return;
  realtimeBound = true;

  sb.channel("admin-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
      toast("طلب جديد! 🚀");
      orders.unshift(payload.new);
      renderOrders();
      loadAnalytics();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reviews" }, () => {
      toast("تقييم جديد! ⭐");
      loadReviews();
      loadAnalytics();
    })
    .subscribe();
}

function initPush() {
  qs("#enablePushBtn")?.style.setProperty("display", "none");
  qs("#enablePushBtn2")?.style.setProperty("display", "none");
}

function initDashboardActions() {
  document.addEventListener("click", async (e) => {
    const refresh = e.target.closest(".refresh-section");

    if (refresh) {
      const section = refresh.dataset.refresh;

      if (section === "analytics") await loadAnalytics();
      if (section === "orders") await loadOrders();
      if (section === "reviews") await loadReviews();
      if (section === "notifications") await loadNotifications();

      return;
    }

    const deleteNotification = e.target.closest(".delete-notification");

    if (deleteNotification) {
      const { error } = await sb.from("notification_events").delete().eq("id", deleteNotification.dataset.id);
      if (error) {
        toast(error.message);
        return;
      }

      toast("Notification deleted");
      loadNotifications();
    }
  });

  qs("#clearAnalyticsBtn")?.addEventListener("click", async () => {
    if (!confirm("واش متأكد باغي تمسح إحصائيات الزيارات؟")) return;

    const { error } = await sb.from("page_views").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast(error.message);
      return;
    }

    toast("Analytics cleared");
    loadAnalytics();
  });

  qs("#clearNotificationsBtn")?.addEventListener("click", async () => {
    if (!confirm("واش متأكد باغي تمسح تاريخ الإشعارات؟")) return;

    const { error } = await sb.from("notification_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast(error.message);
      return;
    }

    toast("Notifications cleared");
    loadNotifications();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireAdmin();
  if (!user) return;

  initNav();
  initOrders();
  initReviews();
  initPush();
  initDashboardActions();

  await refreshAll();
  bindRealtime();
});
