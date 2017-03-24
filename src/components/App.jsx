import React from 'react';
import skygearChat from 'skygear-chat';

import ManagedConversationList from '../utils/ManagedConversationList.jsx';

import Conversation from './Conversation.jsx';
import ConversationPreview from './ConversationPreview.jsx';
import CreateChatModal from './CreateChatModal.jsx';
import CreateGroupModal from './CreateGroupModal.jsx';
import SettingsModal from './SettingsModal.jsx';
import DetailsModal from './DetailsModal.jsx';


function AddButton({
  text,
  onClick
}) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: '#FFF',
        border: '1px solid #000',
        padding: '1rem 2rem',
        cursor: 'pointer'
      }}>
      + {text}
    </button>
  );
}

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      unreadCount: 0,    // user's total unread message count (int)
      currentModal: null, // currently displayed modal dialog name (or null)
      currentConversation: null // currently selected Conversion Record (or null)
    };
    this.conversationList = new ManagedConversationList();
  }

  componentDidMount() {
    // subscribe conversation change
    this.conversationList.subscribe(() => {
      const {currentConversation} = this.state;
      const {conversationList} = this;
      if (currentConversation) {
        this.setState({
          currentConversation: conversationList.get(currentConversation._id)
        });
      } else {
        this.forceUpdate();
      }
    });
    skygearChat.getUnreadCount().then(result => {
      this.setState({unreadCount: result.message});
    });
  }

  render() {
    const {
      state: {
        unreadCount,
        currentModal,
        currentConversation
      },
      conversationList
    } = this;

    return (
      <div
        style={{
          position: 'fixed',
          width: '100%',
          height: '100%',
          display: 'flex',
          overflowX: 'scroll'
        }}>
        <div
          style={{
            height: '100%',
            width: '25%',
            minWidth: '400px',
            borderRight: '1px solid #888',
            display: 'flex',
            flexDirection: 'column'
          }}>
          <div
            style={{
              height: '2rem',
              minHeight: '2rem',
              padding: '1rem 2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #888'
            }}>
            <span>{unreadCount > 0 ? `(${unreadCount})` : ''}</span>
            <h1>Chats</h1>
            <img
              src="img/gear.svg"
              style={{
                cursor: 'pointer',
                height: '2rem'
              }}
              onClick={() => this.setState({currentModal: 'settings'})}/>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              padding: '1rem 0',
              borderBottom: '1px solid #888',
              height: '4rem',
              minHeight: '4rem'
            }}>
            <AddButton
              text="Direct Chat"
              onClick={() => this.setState({currentModal: 'createChat'})}/>
            <AddButton
              text="Group"
              onClick={() => this.setState({currentModal: 'createGroup'})}/>
          </div>
          <div style={{overflowY: 'scroll'}}>
            {
              conversationList
                .filter(c => c.participant_count >= 2)
                .map(c =>
                  <ConversationPreview
                    key={'ConversationPreview-' + c.id + c.updatedAt}
                    selected={
                      c.id === (currentConversation && currentConversation.id)}
                    conversation={c}
                    onClick={() => this.setState({currentConversation: c})}/>
                )
            }
          </div>
        </div>
        {currentConversation &&
          <Conversation
            key={'Conversation-' + currentConversation.id}
            conversation={currentConversation}
            showDetails={() => this.setState({currentModal: 'details'})}/>
        }
        {(modal => {
          switch (modal) {
          case 'createGroup':
            return (
                <CreateGroupModal
                  addConversationDelegate={c => conversationList.add(c)}
                  onClose={() => this.setState({currentModal: null})}/>
            );
          case 'createChat':
            return (
                <CreateChatModal
                  addConversationDelegate={c => conversationList.add(c)}
                  onClose={() => this.setState({currentModal: null})}/>
            );
          case 'settings':
            return (
                <SettingsModal
                  onClose={() => this.setState({currentModal: null})}/>
            );
          case 'details':
            return (
                <DetailsModal
                  key={'DetailsModal-'
                      + currentConversation.id + currentConversation.updatedAt}
                  conversation={currentConversation}
                  updateConversationDelegate={c => conversationList.update(c)}
                  removeConversationDelegate={id => conversationList.remove(id)}
                  onClose={() => this.setState({currentModal: null})}/>
            );
          default:
            return null;
          }
        })(currentModal)}
      </div>
    );
  }
}
