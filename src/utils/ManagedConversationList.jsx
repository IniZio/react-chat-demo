import skygearChat from 'skygear-chat';

/**
 * Convenience class to create Conversation compare functions for sorting.
 * It's just a regular compare function that expects 2 Conversation records.
 *
 * @example
 * new ConversationSorting('title','ascending')
 * => function(a,b) { ... }
 */
export class ConversationSorting {
  /**
   * @param {string} attribute
   * The attribute to sort by, currently supports: 'title', 'last update',
   * 'create time' and 'participant count'.
   * @param {string} order
   * Sorting order, expects either 'ascending' or 'descending'.
   */
  constructor(attribute, order) {
    const attributeMap = {
      title: (c) => c.title || '',
      'last update': (c) => c.updatedAt,
      'create time': (c) => c.createdAt,
      'participant count': (c) => c.participant_count
    };
    const orderMap = {
      ascending: true,
      descending: false
    };
    if (!(
      attributeMap.hasOwnProperty(attribute) &&
      orderMap.hasOwnProperty(order)
    )) {
      throw new Error('invalid conversation sorting parameters: ' +
        attribute + ' ' + order);
    }
    return function (a, b) {
      const aValue = attributeMap[attribute](a);
      const bValue = attributeMap[attribute](b);
      const sortAscending = orderMap[order];
      if (aValue > bValue) {
        return sortAscending ? 1 : -1;
      }
      if (aValue < bValue) {
        return sortAscending ? -1 : 1;
      }
      return 0;
    };
  }
}

/**
 * A managed list of conversations for the current user.
 * Note: You must be logged in to use this.
 */
export default class ManagedConversationList {
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.initialFetch=true]
   * Automatically fetch list of conversations on creation.
   * @param {boolean} [options.pubsubSync=true]
   * Keep list synchronized with server using PubSub.
   * @param {function} [options.sortBy=new ConversationSorting('last update',descending')]
   * How the list is sorted, you can use ConversationSorting wrapper
   * to create one or provide your own.
   */
  constructor({
    initialFetch = true,
    pubsubSync = true,
    sortBy = new ConversationSorting('last update', 'descending')
  } = {}) {
    // conversation compare fn (for sorting)
    this._compare = sortBy;
    // conversation IDs in order (without type prefix)
    this._orderedIDs = [];
    // map of conversaton ID => conversation object
    this._conversations = {};
    // map of subscription ID => event handler
    this._updateHandlers = {};

    if (initialFetch) {
      this.fetch();
    }
    if (pubsubSync) {
      skygearChat.subscribe(this._eventHandler.bind(this));
    }
  }
  /**
   * If you used pubsubSync, you must call this function when the list
   * is no longer needed to prevent a memory leak.
   */
  destroy() {
    skygearChat.unsubscribe(this._eventHandler);
  }
  /**
   * @private
   */
  _eventHandler(event) {
    if (event.record_type === 'conversation') {
      console.log('[conversation event]', event);
      switch (event.event_type) {
      case 'create':
        this.add(event.record);
        break;
      case 'update':
        this.update(event.record);
        break;
      case 'delete':
        this.remove(event.record._id);
        break;
      }
    }
  }
  /**
   * @private
   */
  _conversationsUpdated() {
    const {_conversations, _compare, _updateHandlers} = this;
    this._orderedIDs = Object.keys(_conversations)
      .map(id => _conversations[id])
      .sort(_compare)
      .map(conversation => conversation._id);
    Object.keys(_updateHandlers)
      .map(key => _updateHandlers[key])
      .forEach(handler => handler(this));
  }
  /**
   * Fetches list of conversations from the server.
   * @return {Promise<ManagedConversationList>}
   * Promise of this object, resolves if the fetch is successful.
   */
  fetch() {
    // FIXME: use the getConversations() API when it is fixed
    return skygearChat
      .getUserConversations()
      .then(results => results.map(uc => {
        uc.$transient.conversation.unread_count = uc.unread_count;
        return uc.$transient.conversation;
      }))
      .then(results => {
        console.log('[fetched conversations]', results);
        results.forEach(conversation => {
          this._conversations[conversation._id] = conversation;
        });
        this._conversationsUpdated();
        return this;
      });
  }
  /**
   * List length (like the array length property)
   * @type {number}
   */
  get length() {
    return this._orderedIDs.length;
  }
  /**
   * Get a Conversation
   * @param {number|string} indexOrID
   * Either the list index (number) or conversation ID (string) without type prefix.
   * @return {Conversation}
   */
  get(indexOrID) {
    const {_conversations, _orderedIDs} = this;
    if (typeof indexOrID === 'number') {
      return _conversations[_orderedIDs[indexOrID]];
    } else {
      return _conversations[indexOrID];
    }
  }
  /**
   * List mapping method (like the array map method)
   * @param {function} mappingFunction
   * @return {Array}
   */
  map(mappingFunction) {
    return this._orderedIDs
      .map(id => this._conversations[id])
      .map(mappingFunction);
  }
  /**
   * List filter method (like the array filter method)
   * @param {function} predicate
   * @return {Array}
   */
  filter(predicate) {
    return this._orderedIDs
      .map(id => this._conversations[id])
      .filter(predicate);
  }
  /**
   * Add a conversation, no-op if the conversation already exists.
   * @param {Conversation} conversation
   * @return {ManagedConversationList}
   */
  add(conversation) {
    const {_conversations} = this;
    if (!_conversations.hasOwnProperty(conversation._id)) {
      _conversations[conversation._id] = conversation;
      this._conversationsUpdated();
    }
    return this;
  }
  /**
   * Update a conversation, no-op if the conversation updatedAt date is older than existing.
   * Conversation will be added if it's not in the list.
   * @param {Conversation} conversation
   * @return {ManagedConversationList}
   */
  update(conversation) {
    const {_conversations} = this;
    if (
      _conversations.hasOwnProperty(conversation._id) &&
      conversation.updatedAt >= _conversations[conversation._id].updatedAt
    ) {
      _conversations[conversation._id] = conversation;
      this._conversationsUpdated();
    } else {
      this.add(conversation);
    }
    return this;
  }
  /**
   * Remove a conversation, no-op if the conversation doesn't exist.
   * @param {string} conversationID Conversation ID without type prefix.
   * @return {ManagedConversationList}
   */
  remove(conversationID) {
    const {_conversations} = this;
    if (_conversations.hasOwnProperty(conversationID)) {
      delete _conversations[conversationID];
      this._conversationsUpdated();
    }
    return this;
  }
  /**
   * Subscribe to list updates, handler will be called with one argument: this object.
   * @param {function} handler
   * @return {number} Subscription ID
   */
  subscribe(handler) {
    const {_updateHandlers} = this;
    const subID = Object.keys(_updateHandlers).length;
    _updateHandlers[subID] = handler;
    return subID;
  }
  /**
   * Cancel a subscription.
   * @param {number} subID The subscription ID returned by the subscribe function.
   */
  unsubscribe(subID) {
    delete this._updateHandlers[subID];
  }
}
