(function createTableOrderCloud() {
  const config = window.TABLEORDER_SUPABASE;
  const SESSION_KEY = "tableorder-staff-session";
  let authSession = readStoredSession();

  function readStoredSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function storeSession(session) {
    authSession = session
      ? {
          ...session,
          expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600)
        }
      : null;
    if (authSession) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
    else window.sessionStorage.removeItem(SESSION_KEY);
    return authSession;
  }

  function activeAccessToken() {
    if (!authSession?.access_token || Number(authSession.expires_at || 0) <= Math.floor(Date.now() / 1000) + 15) return "";
    return authSession.access_token;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const error = new Error(data?.msg || data?.message || data?.error_description || data?.hint || `Supabase request failed (${response.status}).`);
      error.status = response.status;
      error.code = data?.code || data?.error || "";
      throw error;
    }

    return data;
  }

  async function request(path, options = {}) {
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase configuration is missing.");
    }

    const { accessToken, ...fetchOptions } = options;
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...fetchOptions,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken || activeAccessToken() || config.publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    return parseResponse(response);
  }

  async function authRequest(path, options = {}) {
    if (!config?.url || !config?.publishableKey) throw new Error("Supabase configuration is missing.");
    const response = await fetch(`${config.url}/auth/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${options.accessToken || activeAccessToken() || config.publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    return parseResponse(response);
  }

  async function signInWithPassword(username, password) {
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const configuredUsername = String(config.staffUsername || "staff").trim().toLowerCase();
    if (normalizedUsername !== configuredUsername) throw new Error("Username or password is incorrect.");

    const session = await authRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: config.staffEmail || "staff@sakestreet.com.au", password })
    });
    return storeSession(session);
  }

  async function refreshSession() {
    if (!authSession?.refresh_token) return storeSession(null);
    try {
      const session = await authRequest("token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: authSession.refresh_token })
      });
      return storeSession(session);
    } catch (error) {
      storeSession(null);
      throw error;
    }
  }

  async function getSession() {
    if (activeAccessToken()) return authSession;
    if (!authSession?.refresh_token) return null;
    return refreshSession();
  }

  async function getStaffProfile() {
    const session = await getSession();
    if (!session?.user?.id) return null;

    const restaurant = await checkConnection();
    if (!restaurant) throw new Error("Restaurant was not found.");
    const rows = await request(
      `restaurant_users?select=restaurant_id,role&restaurant_id=eq.${encodeURIComponent(restaurant.id)}&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
      { accessToken: session.access_token }
    );
    const membership = rows?.[0];
    if (!membership) throw new Error("This account is not assigned to Sake Street.");
    return {
      id: session.user.id,
      email: session.user.email || "Staff",
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      role: membership.role
    };
  }

  async function signOut() {
    const token = activeAccessToken();
    try {
      if (token) await authRequest("logout", { method: "POST", accessToken: token });
    } finally {
      storeSession(null);
    }
  }

  async function checkConnection() {
    const slug = encodeURIComponent(config.restaurantSlug || "sake-street");
    const rows = await request(`restaurants?select=id,slug,name&slug=eq.${slug}&limit=1`);
    return rows?.[0] || null;
  }

  async function loadRestaurantData() {
    const slug = encodeURIComponent(config.restaurantSlug || "sake-street");
    const restaurants = await request(
      `restaurants?select=id,slug,name,subtitle,address,phone,tax_id,tax_rate,is_open,logo_url,theme_config&slug=eq.${slug}&limit=1`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) throw new Error("Restaurant seed was not found.");

    const restaurantId = encodeURIComponent(restaurant.id);
    const [tables, menuItems] = await Promise.all([
      request(`restaurant_tables?select=id,local_id,name,table_token,sort_order&restaurant_id=eq.${restaurantId}&is_active=eq.true&order=sort_order.asc`),
      request(`menu_items?select=id,local_id,category,name,description,price,tags,photo_url,option_template,sold_out,sort_order&restaurant_id=eq.${restaurantId}&is_active=eq.true&order=sort_order.asc`)
    ]);

    return { restaurant, tables, menuItems };
  }

  async function bootstrapMenu(items) {
    return request("rpc/bootstrap_menu", {
      method: "POST",
      body: JSON.stringify({
        p_restaurant_slug: config.restaurantSlug || "sake-street",
        p_items: items
      })
    });
  }

  async function submitOrder(order, restaurantId, tableId) {
    if (!restaurantId || !tableId) throw new Error("Cloud restaurant or table ID is missing. Load Cloud Data first.");

    const items = order.items.map((item) => ({
      menu_item_id: item.menuItemCloudId || null,
      name: item.name,
      base_price: item.basePrice ?? item.price,
      unit_price: item.price,
      quantity: item.quantity,
      options: item.options || []
    }));

    const result = await request("rpc/submit_order", {
      method: "POST",
      body: JSON.stringify({
        p_restaurant_id: restaurantId,
        p_table_id: tableId,
        p_local_id: order.id,
        p_note: order.note || "",
        p_items: items
      })
    });

    return { id: result.id, number: Number(result.order_number) };
  }

  async function loadCustomerOrderStatus(orderId, localId, tableToken) {
    if (!orderId || !localId || !tableToken) throw new Error("Order tracking details are missing.");
    return request("rpc/get_customer_order_status", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_local_id: localId, p_table_token: tableToken })
    });
  }

  async function loadOrders(restaurantId) {
    if (!restaurantId) throw new Error("Restaurant ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");

    return request(
      `orders?select=id,local_id,order_number,table_id,status,note,subtotal,tax,total,created_at,served_at,closed_at,restaurant_tables(local_id,name),order_items(id,menu_item_id,name_snapshot,base_price,unit_price,quantity,options)&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=500`,
      { accessToken: session.access_token }
    );
  }

  async function updateOrderStatus(orderId, status) {
    if (!orderId) throw new Error("Cloud order ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    const timestamp = new Date().toISOString();
    const body = { status };
    if (status === "Served") body.served_at = timestamp;
    if (["Paid", "Cancelled"].includes(status)) body.closed_at = timestamp;

    return request(`orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      accessToken: session.access_token,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body)
    });
  }

  async function updateMenuItemPhoto(menuItemId, photoUrl) {
    if (!menuItemId) throw new Error("Menu item ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request(`menu_items?id=eq.${encodeURIComponent(menuItemId)}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify({ photo_url: photoUrl || "" })
    });
  }

  async function updateMenuItemSoldOut(menuItemId, soldOut) {
    if (!menuItemId) throw new Error("Menu item ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request(`menu_items?id=eq.${encodeURIComponent(menuItemId)}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sold_out: Boolean(soldOut) })
    });
  }

  async function createMenuItem(restaurantId, item, sortOrder) {
    if (!restaurantId) throw new Error("Restaurant ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request("menu_items", {
      method: "POST", accessToken: session.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, local_id: item.id, category: item.category, name: item.name,
        description: item.description || "", price: item.price, tags: item.tags || [], photo_url: item.photoData || "",
        option_template: item.optionTemplate || "none", sold_out: Boolean(item.soldOut), sort_order: sortOrder || 0 })
    });
  }

  async function deactivateMenuItem(menuItemId) {
    if (!menuItemId) throw new Error("Menu item ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request(`menu_items?id=eq.${encodeURIComponent(menuItemId)}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_active: false })
    });
  }

  async function createRestaurantTable(restaurantId, table, sortOrder) {
    if (!restaurantId) throw new Error("Restaurant ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request("restaurant_tables", {
      method: "POST", accessToken: session.access_token, headers: { Prefer: "return=representation" },
      body: JSON.stringify({ restaurant_id: restaurantId, local_id: table.id, name: table.name, table_token: table.token, sort_order: sortOrder || 0 })
    });
  }

  async function updateRestaurantTable(tableId, fields) {
    if (!tableId) throw new Error("Table ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request(`restaurant_tables?id=eq.${encodeURIComponent(tableId)}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=minimal" }, body: JSON.stringify(fields)
    });
  }

  async function deactivateRestaurantTable(tableId) {
    return updateRestaurantTable(tableId, { is_active: false });
  }

  async function updateRestaurantProfile(restaurantId, profile) {
    if (!restaurantId) throw new Error("Restaurant ID is missing.");
    const session = await getSession();
    if (!session?.access_token) throw new Error("Staff login is required.");
    return request(`restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
      method: "PATCH", accessToken: session.access_token, headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name: profile.name, subtitle: profile.subtitle, address: profile.address, phone: profile.phone,
        tax_id: profile.taxId, tax_rate: profile.taxRate, is_open: profile.isOpen, logo_url: profile.logoUrl || "", theme_config: profile.themeConfig || {} })
    });
  }

  window.TableOrderCloud = {
    config, request, checkConnection, loadRestaurantData, bootstrapMenu, submitOrder, loadCustomerOrderStatus, loadOrders,
    updateOrderStatus, updateMenuItemPhoto, updateMenuItemSoldOut, createMenuItem, deactivateMenuItem,
    createRestaurantTable, updateRestaurantTable, deactivateRestaurantTable, updateRestaurantProfile,
    signInWithPassword, getSession, getStaffProfile, signOut
  };
})();
