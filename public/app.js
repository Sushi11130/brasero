const config = window.BRASERO_CONFIG || {};
const supabaseReady = Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes("TON-PROJET"));
const client = supabaseReady ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const reactionChoices = ["👍", "😂", "❤️", "🔥", "👀"];

const state = {
  session: null,
  profile: null,
  profiles: [],
  rooms: [],
  activeRoomId: null,
  messages: [],
  files: [],
  polls: [],
  votes: [],
  reactions: [],
  fileSearch: "",
  adminFileSearch: "",
  subscribed: false
};

const elements = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  authForm: document.querySelector("#authForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  displayNameInput: document.querySelector("#displayNameInput"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  setupWarning: document.querySelector("#setupWarning"),
  currentName: document.querySelector("#currentName"),
  streakText: document.querySelector("#streakText"),
  adminTab: document.querySelector("#adminTab"),
  tabs: document.querySelectorAll(".tab"),
  panels: {
    chat: document.querySelector("#chatPanel"),
    files: document.querySelector("#filesPanel"),
    polls: document.querySelector("#pollsPanel"),
    admin: document.querySelector("#adminPanel")
  },
  blockedBanner: document.querySelector("#blockedBanner"),
  activeRoomName: document.querySelector("#activeRoomName"),
  roomList: document.querySelector("#roomList"),
  roomForm: document.querySelector("#roomForm"),
  newRoomToggle: document.querySelector("#newRoomToggle"),
  roomNameInput: document.querySelector("#roomNameInput"),
  roomMembersSelect: document.querySelector("#roomMembersSelect"),
  messageList: document.querySelector("#messageList"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  fileSearchInput: document.querySelector("#fileSearchInput"),
  fileForm: document.querySelector("#fileForm"),
  fileInput: document.querySelector("#fileInput"),
  fileList: document.querySelector("#fileList"),
  pollForm: document.querySelector("#pollForm"),
  pollQuestionInput: document.querySelector("#pollQuestionInput"),
  pollOptionsInput: document.querySelector("#pollOptionsInput"),
  pollList: document.querySelector("#pollList"),
  adminUserSelect: document.querySelector("#adminUserSelect"),
  toggleBlockButton: document.querySelector("#toggleBlockButton"),
  refreshAdminButton: document.querySelector("#refreshAdminButton"),
  resetPasswordInput: document.querySelector("#resetPasswordInput"),
  resetPasswordButton: document.querySelector("#resetPasswordButton"),
  adminFileSearchInput: document.querySelector("#adminFileSearchInput"),
  adminFileList: document.querySelector("#adminFileList"),
  adminRoomSelect: document.querySelector("#adminRoomSelect"),
  adminMessageList: document.querySelector("#adminMessageList"),
  toast: document.querySelector("#toast")
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 3200);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function displayNameFor(userId) {
  const profile = state.profiles.find((item) => item.id === userId);
  return profile ? profile.display_name : "Quelqu'un";
}

function isAdmin() {
  return state.profile && state.profile.role === "admin";
}

function isBlocked() {
  return Boolean(state.profile && state.profile.chat_blocked);
}

function currentRoom() {
  return state.rooms.find((room) => room.id === state.activeRoomId) || state.rooms[0];
}

function setTab(tabName) {
  for (const tab of elements.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }

  for (const [name, panel] of Object.entries(elements.panels)) {
    panel.classList.toggle("hidden", name !== tabName);
  }

  if (tabName === "admin") {
    renderAdminMessages();
  }
}

function renderShell() {
  const loggedIn = Boolean(state.session);
  elements.authView.classList.toggle("hidden", loggedIn);
  elements.appView.classList.toggle("hidden", !loggedIn);
  elements.setupWarning.classList.toggle("hidden", supabaseReady);

  if (!loggedIn || !state.profile) return;

  elements.currentName.textContent = state.profile.display_name;
  elements.adminTab.classList.toggle("hidden", !isAdmin());
  elements.blockedBanner.classList.toggle("hidden", !isBlocked());
  elements.messageInput.disabled = isBlocked();
  elements.messageForm.querySelector("button").disabled = isBlocked();
  elements.fileInput.disabled = isBlocked();
  elements.fileForm.querySelector("button").disabled = isBlocked();
  elements.streakText.textContent = `${state.profile.flame_streak || 0} flamme${state.profile.flame_streak > 1 ? "s" : ""}`;
}

function renderRooms() {
  elements.roomList.innerHTML = "";
  elements.roomMembersSelect.innerHTML = "";
  elements.adminRoomSelect.innerHTML = "";

  for (const profile of state.profiles) {
    if (profile.id === state.session.user.id) continue;
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.display_name;
    elements.roomMembersSelect.append(option);
  }

  for (const room of state.rooms) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `room-button${room.id === state.activeRoomId ? " active" : ""}`;
    button.textContent = room.is_general ? "General" : room.name;
    button.addEventListener("click", () => {
      state.activeRoomId = room.id;
      renderRooms();
      renderMessages();
    });
    item.append(button);
    elements.roomList.append(item);

    const adminOption = document.createElement("option");
    adminOption.value = room.id;
    adminOption.textContent = room.is_general ? "General" : room.name;
    elements.adminRoomSelect.append(adminOption);
  }

  if (state.activeRoomId) {
    elements.adminRoomSelect.value = state.activeRoomId;
  }
}

function reactionSummary(messageId) {
  return reactionChoices.map((emoji) => ({
    emoji,
    count: state.reactions.filter((reaction) => reaction.message_id === messageId && reaction.emoji === emoji).length,
    mine: state.reactions.some((reaction) => reaction.message_id === messageId && reaction.emoji === emoji && reaction.user_id === state.session.user.id)
  }));
}

function buildMessageItem(message, includeRoom = false) {
  const item = document.createElement("li");
  item.className = `message${message.author_id === state.session.user.id ? " mine" : ""}`;

  const room = state.rooms.find((entry) => entry.id === message.room_id);
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${displayNameFor(message.author_id)} · ${formatTime(message.created_at)}${includeRoom && room ? ` · ${room.name}` : ""}`;

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.body;

  const reactions = document.createElement("div");
  reactions.className = "reactions";
  for (const reaction of reactionSummary(message.id)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `reaction${reaction.mine ? " selected" : ""}`;
    button.textContent = reaction.count ? `${reaction.emoji} ${reaction.count}` : reaction.emoji;
    button.addEventListener("click", () => toggleReaction(message.id, reaction.emoji));
    reactions.append(button);
  }

  item.append(meta, text, reactions);
  return item;
}

function renderMessages() {
  const room = currentRoom();
  elements.activeRoomName.textContent = room ? room.name : "General";
  elements.messageList.innerHTML = "";

  const visibleMessages = state.messages.filter((message) => message.room_id === state.activeRoomId);
  for (const message of visibleMessages) {
    elements.messageList.append(buildMessageItem(message));
  }

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

async function signedFileUrl(path) {
  const { data, error } = await client.storage.from("files").createSignedUrl(path, 60 * 10);
  if (error) return "";
  return data.signedUrl;
}

function fileMatches(file, search) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const owner = displayNameFor(file.owner_id).toLowerCase();
  return file.original_name.toLowerCase().includes(needle) || owner.includes(needle) || (file.mime_type || "").toLowerCase().includes(needle);
}

async function renderFiles() {
  elements.fileList.innerHTML = "";
  elements.adminFileList.innerHTML = "";

  const publicFiles = state.files.filter((file) => fileMatches(file, state.fileSearch));
  const adminFiles = state.files.filter((file) => fileMatches(file, state.adminFileSearch));

  await renderFileList(elements.fileList, publicFiles);
  await renderFileList(elements.adminFileList, adminFiles);
}

async function renderFileList(list, files) {
  if (!files.length) {
    list.innerHTML = `<li class="muted-empty">Aucun fichier trouve.</li>`;
    return;
  }

  for (const file of files) {
    const url = await signedFileUrl(file.storage_path);
    const item = document.createElement("li");
    item.className = "file-item";
    item.innerHTML = `<a target="_blank" rel="noreferrer"></a><div class="small"></div>`;
    item.querySelector("a").href = url;
    item.querySelector("a").textContent = file.original_name;
    item.querySelector(".small").textContent = `${displayNameFor(file.owner_id)} · ${formatSize(file.size_bytes)} · ${formatTime(file.created_at)}`;
    list.append(item);
  }
}

function renderPolls() {
  elements.pollList.innerHTML = "";

  if (!state.polls.length) {
    elements.pollList.innerHTML = `<li class="muted-empty">Aucun sondage pour l'instant.</li>`;
    return;
  }

  for (const poll of state.polls) {
    const item = document.createElement("li");
    item.className = "poll-item";

    const title = document.createElement("h3");
    title.textContent = poll.question;
    item.append(title);

    const options = Array.isArray(poll.options) ? poll.options : [];
    const votes = state.votes.filter((vote) => vote.poll_id === poll.id);
    const myVote = votes.find((vote) => vote.user_id === state.session.user.id);

    for (const option of options) {
      const count = votes.filter((vote) => vote.option_text === option).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `poll-option${myVote && myVote.option_text === option ? " selected" : ""}`;
      button.textContent = `${option} (${count})`;
      button.addEventListener("click", () => voteForPoll(poll.id, option));
      item.append(button);
    }

    elements.pollList.append(item);
  }
}

function renderAdminUsers() {
  elements.adminUserSelect.innerHTML = "";

  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.display_name} · ${profile.email || "email masque"} · ${profile.chat_blocked ? "bloque" : "actif"}`;
    elements.adminUserSelect.append(option);
  }
}

function renderAdminMessages() {
  elements.adminMessageList.innerHTML = "";
  const selectedRoomId = elements.adminRoomSelect.value || state.activeRoomId;
  const messages = state.messages.filter((message) => message.room_id === selectedRoomId);

  if (!messages.length) {
    elements.adminMessageList.innerHTML = `<li class="muted-empty">Aucun message dans ce salon.</li>`;
    return;
  }

  for (const message of messages) {
    elements.adminMessageList.append(buildMessageItem(message, true));
  }
}

async function loadEverything() {
  const userId = state.session.user.id;
  const [profileResult, profilesResult, roomsResult, messagesResult, filesResult, pollsResult, votesResult, reactionsResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).single(),
    client.from("profiles").select("*").order("display_name"),
    client.from("rooms").select("*").order("is_general", { ascending: false }).order("created_at", { ascending: true }),
    client.from("messages").select("*").order("created_at", { ascending: true }).limit(300),
    client.from("files").select("*").order("created_at", { ascending: false }).limit(300),
    client.from("polls").select("*").order("created_at", { ascending: false }),
    client.from("poll_votes").select("*"),
    client.from("message_reactions").select("*")
  ]);

  if (profileResult.error) throw profileResult.error;
  state.profile = profileResult.data;
  state.profiles = profilesResult.data || [];
  state.rooms = roomsResult.data || [];
  state.messages = messagesResult.data || [];
  state.files = filesResult.data || [];
  state.polls = pollsResult.data || [];
  state.votes = votesResult.data || [];
  state.reactions = reactionsResult.data || [];

  if (!state.activeRoomId && state.rooms.length) {
    const general = state.rooms.find((room) => room.is_general);
    state.activeRoomId = general ? general.id : state.rooms[0].id;
  }

  renderShell();
  renderRooms();
  renderMessages();
  await renderFiles();
  renderPolls();
  renderAdminUsers();
  renderAdminMessages();
}

async function touchStreak() {
  const { data, error } = await client.rpc("touch_flame");

  if (!error) {
    state.profile = data;
    state.profiles = state.profiles.map((profile) => profile.id === data.id ? data : profile);
    renderShell();
  }
}

async function ensureSession() {
  if (!supabaseReady) {
    renderShell();
    return;
  }

  const { data } = await client.auth.getSession();
  state.session = data.session;
  renderShell();

  if (state.session) {
    await loadEverything();
    subscribeRealtime();
  }
}

function subscribeRealtime() {
  if (state.subscribed) return;
  state.subscribed = true;

  client
    .channel("brasero-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "files" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, loadEverything)
    .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, loadEverything)
    .subscribe();
}

async function signIn(event) {
  event.preventDefault();
  if (!client) return showToast("Configure Supabase avant de te connecter.");

  const { data, error } = await client.auth.signInWithPassword({
    email: elements.emailInput.value.trim(),
    password: elements.passwordInput.value
  });

  if (error) return showToast(error.message);
  state.session = data.session;
  await loadEverything();
  subscribeRealtime();
}

async function signUp() {
  if (!client) return showToast("Configure Supabase avant de creer un compte.");

  const displayName = elements.displayNameInput.value.trim() || elements.emailInput.value.split("@")[0];
  const { data, error } = await client.auth.signUp({
    email: elements.emailInput.value.trim(),
    password: elements.passwordInput.value,
    options: { data: { display_name: displayName } }
  });

  if (error) return showToast(error.message);
  showToast(data.session ? "Compte cree." : "Compte cree, verifie tes emails si Supabase le demande.");
  state.session = data.session;
  if (state.session) {
    await loadEverything();
    subscribeRealtime();
  }
}

async function createRoom(event) {
  event.preventDefault();
  const roomName = elements.roomNameInput.value.trim();
  const memberIds = Array.from(elements.roomMembersSelect.selectedOptions).map((option) => option.value);

  if (!roomName) return showToast("Donne un nom au salon.");
  if (!memberIds.length) return showToast("Choisis au moins une personne.");

  const { data, error } = await client.rpc("create_private_room", {
    room_name: roomName,
    member_ids: memberIds
  });

  if (error) return showToast(error.message);
  state.activeRoomId = data.id;
  elements.roomNameInput.value = "";
  elements.roomMembersSelect.selectedIndex = -1;
  elements.roomForm.classList.add("hidden");
  await loadEverything();
  showToast("Salon prive cree.");
}

async function sendMessage(event) {
  event.preventDefault();
  const body = elements.messageInput.value.trim();
  if (!body || isBlocked() || !state.activeRoomId) return;

  const { error } = await client.from("messages").insert({ body, room_id: state.activeRoomId });
  if (error) return showToast(error.message);

  elements.messageInput.value = "";
  await touchStreak();
}

async function toggleReaction(messageId, emoji) {
  const existing = state.reactions.find((reaction) => reaction.message_id === messageId && reaction.emoji === emoji && reaction.user_id === state.session.user.id);

  if (existing) {
    const { error } = await client
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("emoji", emoji)
      .eq("user_id", state.session.user.id);
    if (error) showToast(error.message);
    return;
  }

  const { error } = await client.from("message_reactions").insert({ message_id: messageId, emoji });
  if (error) showToast(error.message);
}

async function uploadFile(event) {
  event.preventDefault();
  if (isBlocked()) return;
  const file = elements.fileInput.files[0];
  if (!file) return showToast("Choisis un fichier.");

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${state.session.user.id}/${Date.now()}-${safeName}`;
  const upload = await client.storage.from("files").upload(storagePath, file, { upsert: false });
  if (upload.error) return showToast(upload.error.message);

  const { error } = await client.from("files").insert({
    original_name: file.name,
    storage_path: storagePath,
    size_bytes: file.size,
    mime_type: file.type || "application/octet-stream"
  });

  if (error) return showToast(error.message);
  elements.fileInput.value = "";
  showToast("Fichier ajoute.");
}

async function createPoll(event) {
  event.preventDefault();
  const question = elements.pollQuestionInput.value.trim();
  const options = elements.pollOptionsInput.value.split("\n").map((option) => option.trim()).filter(Boolean).slice(0, 8);

  if (!question || options.length < 2) {
    showToast("Il faut une question et au moins deux options.");
    return;
  }

  const { error } = await client.from("polls").insert({ question, options });
  if (error) return showToast(error.message);

  elements.pollQuestionInput.value = "";
  elements.pollOptionsInput.value = "";
  showToast("Sondage lance.");
}

async function voteForPoll(pollId, optionText) {
  const { error } = await client.from("poll_votes").upsert({
    poll_id: pollId,
    user_id: state.session.user.id,
    option_text: optionText
  });

  if (error) showToast(error.message);
}

async function toggleBlockSelectedUser() {
  if (!isAdmin()) return;
  const userId = elements.adminUserSelect.value;
  const profile = state.profiles.find((item) => item.id === userId);
  if (!profile) return;

  const { error } = await client.from("profiles").update({ chat_blocked: !profile.chat_blocked }).eq("id", userId);
  if (error) return showToast(error.message);
  showToast(profile.chat_blocked ? "Utilisateur debloque." : "Utilisateur bloque.");
}

async function resetSelectedPassword() {
  if (!isAdmin()) return;
  const password = elements.resetPasswordInput.value;
  if (password.length < 6) return showToast("Mot de passe trop court.");

  const response = await fetch("/api/admin-reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.session.access_token}`
    },
    body: JSON.stringify({ userId: elements.adminUserSelect.value, password })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) return showToast(result.error || "Changement impossible.");

  elements.resetPasswordInput.value = "";
  showToast("Mot de passe change.");
}

elements.authForm.addEventListener("submit", signIn);
elements.signUpButton.addEventListener("click", signUp);
elements.signOutButton.addEventListener("click", async () => {
  await client.auth.signOut();
  window.location.reload();
});
elements.newRoomToggle.addEventListener("click", () => elements.roomForm.classList.toggle("hidden"));
elements.roomForm.addEventListener("submit", createRoom);
elements.messageForm.addEventListener("submit", sendMessage);
elements.fileForm.addEventListener("submit", uploadFile);
elements.pollForm.addEventListener("submit", createPoll);
elements.toggleBlockButton.addEventListener("click", toggleBlockSelectedUser);
elements.refreshAdminButton.addEventListener("click", loadEverything);
elements.resetPasswordButton.addEventListener("click", resetSelectedPassword);
elements.adminRoomSelect.addEventListener("change", renderAdminMessages);
elements.fileSearchInput.addEventListener("input", async () => {
  state.fileSearch = elements.fileSearchInput.value;
  await renderFiles();
});
elements.adminFileSearchInput.addEventListener("input", async () => {
  state.adminFileSearch = elements.adminFileSearchInput.value;
  await renderFiles();
});

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
}

ensureSession().catch((error) => showToast(error.message));
