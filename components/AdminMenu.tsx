
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, User } from '../types';
import { TrashIcon, ShieldCheckIcon, StarIcon, CameraIcon, UserIcon, CloudArrowUpIcon, XMarkIcon, BellIcon, ChevronRightIcon, KeyIcon } from './icons';
import BulkTaskModal from './BulkTaskModal';
import ConfirmationModal from './ConfirmationModal';
import { ADMIN_USER_NAME, DEFAULT_INITIAL_PASSWORD, NAKAGOMI_INITIAL_PASSWORD } from '../constants';

interface Alert {
  type: 'schedule' | 'overdue';
  userName: string;
  message: string;
}

interface AdminMenuProps {
    isOpen: boolean;
    onClose: () => void;
    users: User[];
    currentUser: User;
    onSave: (updatedUsers: User[], deletedUserNames: string[]) => void;
    onResetUserPassword: (userName: string) => void;
    announcement: string;
    onSetAnnouncement: (text: string) => void;
    appVersion: string;
    onSetAppVersion: (version: string) => void;
    onCreateTasks: (taskData: Omit<CallRequest, 'id' | 'status' | 'createdAt' | 'assignee' | 'customerId'>, assignees: string[]) => void;
    alerts: Alert[];
    onJumpToMember: (userName: string) => void;
}

type AdminTab = 'alerts' | 'users' | 'announcement' | 'tasks' | 'version';

interface NewUserModalProps {
    onClose: () => void;
    onAddUser: (userData: Omit<User, 'createdAt' | 'isLoggedInAsAdmin' | 'availabilityStatus' | 'nonWorkingDays' | 'comment' | 'password'> & { password?: string }) => void;
    availableProductsOptions: string[];
}

const AddUserModal: React.FC<NewUserModalProps> = ({ onClose, onAddUser, availableProductsOptions }) => {
    const [name, setName] = useState('');
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [availableProducts, setAvailableProducts] = useState<string[]>(['回線']);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [isLinePrechecker, setIsLinePrechecker] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleProductChange = (product: string) => {
        setAvailableProducts(prev =>
            prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
        );
    };

    const handleSuperAdminChange = (checked: boolean) => {
        setIsSuperAdmin(checked);
        if (checked) {
            setIsAdmin(true);
        }
    };

    const handleFileSelect = (file: File | null) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfilePicture(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else if (file) {
            alert('画像ファイルのみアップロードできます。');
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files?.[0]);
    };
    
    const handleDragEvent = (e: React.DragEvent<HTMLDivElement>, isEntering: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(isEntering);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            alert('ユーザー名を入力してください。');
            return;
        }
        if (availableProducts.length === 0) {
            alert('案内可能商材を少なくとも1つ選択してください。');
            return;
        }
        onAddUser({ name: name.trim(), profilePicture, availableProducts, isAdmin, isSuperAdmin, isLinePrechecker });
    };

    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-[#0193be]">新規ユーザー追加</h3>
                </div>
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="flex items-start gap-4">
                        <div 
                            className={`relative w-24 h-24 rounded-full flex-shrink-0 border-2 border-dashed flex items-center justify-center text-slate-400 cursor-pointer hover:border-[#0193be] hover:text-[#0193be] transition ${isDragging ? 'border-[#0193be] bg-sky-50' : 'border-slate-300'}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={(e) => handleDragEvent(e, true)}
                            onDragEnter={(e) => handleDragEvent(e, true)}
                            onDragLeave={(e) => handleDragEvent(e, false)}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                                accept="image/*"
                                className="hidden"
                            />
                            {profilePicture ? (
                                <img src={profilePicture} alt="プレビュー" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <div className="text-center">
                                    <CloudArrowUpIcon className="w-8 h-8 mx-auto" />
                                    <span className="text-xs mt-1 block">画像</span>
                                </div>
                            )}
                        </div>
                        <div className="flex-grow">
                            <label htmlFor="newUserName" className="block text-sm font-medium text-[#0193be]/80 mb-1">ユーザー名 <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="newUserName"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="例: 山田 太郎"
                                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-medium text-[#0193be]/80 mb-2">案内可能商材</h4>
                        <div className="flex items-center gap-4">
                            {availableProductsOptions.map(product => (
                                <label key={product} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={availableProducts.includes(product)}
                                        onChange={() => handleProductChange(product)}
                                        className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                                    />
                                    {product}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-medium text-[#0193be]/80 mb-2">権限</h4>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isAdmin}
                                    onChange={(e) => setIsAdmin(e.target.checked)}
                                    disabled={isSuperAdmin}
                                    className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be] disabled:opacity-50"
                                />
                                <ShieldCheckIcon className="w-5 h-5" />
                                管理者
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isSuperAdmin}
                                    onChange={(e) => handleSuperAdminChange(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                                />
                                <StarIcon className="w-5 h-5 text-yellow-500" />
                                SA
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isLinePrechecker}
                                    onChange={(e) => setIsLinePrechecker(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                                />
                                回線前確者
                            </label>
                        </div>
                         {isSuperAdmin && <p className="text-xs text-slate-500 mt-2">SAは自動的に管理者権限を持ちます。</p>}
                    </div>

                </div>
                <div className="flex justify-end gap-3 p-4 bg-slate-100 border-t border-slate-200">
                    <button type="button" onClick={onClose} className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition">
                        キャンセル
                    </button>
                    <button type="submit" className="bg-[#0193be] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#017a9a] transition">
                        追加
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};


const AdminMenu: React.FC<AdminMenuProps> = ({ 
    isOpen, 
    onClose, 
    users, 
    currentUser,
    onSave,
    onResetUserPassword,
    announcement, 
    onSetAnnouncement,
    appVersion,
    onSetAppVersion,
    onCreateTasks,
    alerts,
    onJumpToMember,
}) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    
    const [localUsers, setLocalUsers] = useState<User[]>([]);
    const [usersToDelete, setUsersToDelete] = useState<Set<string>>(new Set());
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [selectedUsersForTask, setSelectedUsersForTask] = useState<Set<string>>(new Set());
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [resettingUser, setResettingUser] = useState<User | null>(null);

    const [announcementText, setAnnouncementText] = useState(announcement);
    const [versionText, setVersionText] = useState(appVersion);
    
    const [userToUpdatePicture, setUserToUpdatePicture] = useState<string | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isSuperAdmin = currentUser.isSuperAdmin;
    const AVAILABLE_PRODUCTS = ['回線', '水'];

    useEffect(() => {
        setAnnouncementText(announcement);
    }, [announcement]);
    
    useEffect(() => {
        setVersionText(appVersion);
    }, [appVersion]);

     useEffect(() => {
        if (isOpen) {
            setLocalUsers(JSON.parse(JSON.stringify(users)));
            setUsersToDelete(new Set());
            setSelectedUsersForTask(new Set());
            setActiveTab(alerts.length > 0 ? 'alerts' : 'users');
        }
    }, [isOpen, users, alerts]);

    const handleAddUser = (userData: Omit<User, 'createdAt' | 'isLoggedInAsAdmin' | 'availabilityStatus' | 'nonWorkingDays' | 'comment' | 'password'> & { password?: string }) => {
        if (userData.name && !localUsers.find(u => u.name === userData.name)) {
            const newUser: User = { 
                ...userData,
                createdAt: new Date().toISOString(),
                availabilityStatus: '受付可',
                nonWorkingDays: [],
                availableProducts: userData.availableProducts,
                comment: '',
                password: 'NNE040121', // Default password for new users
            };
            setLocalUsers(prev => [...prev, newUser]);
            setIsAddUserModalOpen(false);
        } else {
            alert('ユーザー名が空か、すでに存在します。');
        }
    };
    
    const handleDeleteToggle = (userName: string) => {
        setUsersToDelete(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userName)) {
                newSet.delete(userName);
            } else {
                newSet.add(userName);
            }
            return newSet;
        });
    };

    const handleToggleAdmin = (name: string) => {
      setLocalUsers(prev => prev.map(u => u.name === name ? { ...u, isAdmin: !u.isAdmin } : u));
    };

    const handleToggleSuperAdmin = (name: string) => {
      setLocalUsers(prev => prev.map(u => {
          if (u.name === name) {
              const newIsSuperAdmin = !u.isSuperAdmin;
              return {
                  ...u,
                  isSuperAdmin: newIsSuperAdmin,
                  isAdmin: newIsSuperAdmin ? true : u.isAdmin,
              };
          }
          return u;
      }));
    };

    const handleToggleLinePrechecker = (name: string) => {
      setLocalUsers(prev => prev.map(u => u.name === name ? { ...u, isLinePrechecker: !u.isLinePrechecker } : u));
    };
    
    const handleSetProfilePicture = (userName: string, imageDataUrl: string | null) => {
        setLocalUsers(prev => prev.map(u => u.name === userName ? {...u, profilePicture: imageDataUrl} : u));
    };

    const handleUpdateAvailableProducts = (userName: string, products: string[]) => {
        setLocalUsers(prevUsers =>
            prevUsers.map(user =>
                user.name === userName ? { ...user, availableProducts: products } : user
            )
        );
    };

    const handleSave = () => {
        const finalUsers = localUsers.filter(u => !usersToDelete.has(u.name));
        const deletedNames = Array.from(usersToDelete);
        onSave(finalUsers, deletedNames);
        onClose();
    };

    const handleSetAnnouncement = (e: React.FormEvent) => {
        e.preventDefault();
        onSetAnnouncement(announcementText);
        alert('周知事項が更新されました。');
    };

    const handleSetVersion = (e: React.FormEvent) => {
        e.preventDefault();
        onSetAppVersion(versionText);
        alert('バージョンが更新されました。');
    };
    
    const handlePictureUploadClick = (userName: string) => {
        setUserToUpdatePicture(userName);
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && userToUpdatePicture) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleSetProfilePicture(userToUpdatePicture, reader.result as string);
                setUserToUpdatePicture(null);
            };
            reader.readAsDataURL(file);
        }
        if(e.target) {
            e.target.value = '';
        }
    };
    
    const handleRemovePicture = (e: React.MouseEvent, userName: string) => {
        e.stopPropagation();
        if (window.confirm(`${userName}さんのプロフィール画像を削除しますか？`)) {
            handleSetProfilePicture(userName, null);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, userName: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(userName);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLIElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(null);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLLIElement>, userName: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(null);
        
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleSetProfilePicture(userName, reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            alert('画像ファイルのみアップロードできます。');
        }
    };

    const handleToggleUserForTask = (name: string) => {
        setSelectedUsersForTask(prev => {
            const newSet = new Set(prev);
            if (newSet.has(name)) newSet.delete(name);
            else newSet.add(name);
            return newSet;
        });
    };

    const handleSelectByProduct = (product: '回線' | '水') => {
        const selected = new Set<string>();
        localUsers.forEach(user => {
            if ((user.availableProducts || []).includes(product)) {
                selected.add(user.name);
            }
        });
        setSelectedUsersForTask(selected);
    };

    const handleSelectAllTasks = () => {
        setSelectedUsersForTask(new Set(localUsers.map(u => u.name)));
    };

    const handleClearAllTasks = () => {
        setSelectedUsersForTask(new Set());
    };

    const handleBulkTaskSubmit = (taskData: Omit<CallRequest, 'id' | 'status' | 'createdAt' | 'assignee' | 'customerId' | 'requester' | 'prechecker' | 'imported' | 'history' | 'absenceCount'>) => {
        const fullTaskData = { ...taskData, requester: currentUser.name };
        onCreateTasks(fullTaskData, Array.from(selectedUsersForTask));
        setIsTaskModalOpen(false);
        setSelectedUsersForTask(new Set());
    };

    const TabButton: React.FC<{tab: AdminTab, label: string, count?: number}> = ({ tab, label, count = 0 }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`relative whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] rounded-t-md ${
                activeTab === tab ? 'border-[#0193be] text-[#0193be]' : 'border-transparent text-[#0193be]/80 hover:text-[#0193be] hover:border-slate-300'
            }`}
            role="tab"
            aria-selected={activeTab === tab}
        >
            {label}
            {count > 0 && (
                <span className="absolute top-1 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full transform translate-x-1/2 -translate-y-1/2">
                    {count}
                </span>
            )}
        </button>
    );

    if (!isOpen) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png, image/jpeg, image/gif, image/webp"
                    className="hidden"
                />
                <div className="p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-[#0193be] flex items-center gap-2">
                        <ShieldCheckIcon className="w-6 h-6" />
                        {isSuperAdmin ? 'SA用メニュー' : '管理者用メニュー'}
                        {isSuperAdmin && <span className="text-sm font-normal text-slate-400 ml-2">{appVersion}</span>}
                    </h2>
                    <button onClick={onClose} className="text-[#0193be]/80 hover:text-[#0193be] transition">
                        <XMarkIcon className="w-7 h-7" />
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto">
                    <div className="px-6 pb-6 pt-4">
                        <div className="border-b border-slate-200 mb-6">
                            <nav className="-mb-px flex space-x-6" aria-label="Admin Tabs" role="tablist">
                                <TabButton tab="alerts" label="アラート" count={alerts.length} />
                                <TabButton tab="users" label="ユーザー管理" />
                                <TabButton tab="tasks" label="全体タスク" />
                                <TabButton tab="announcement" label="周知事項" />
                                {isSuperAdmin && <TabButton tab="version" label="バージョン" />}
                            </nav>
                        </div>

                        <div>
                            {activeTab === 'alerts' && (
                                <div role="tabpanel" aria-labelledby="tab-alerts">
                                    {alerts.length > 0 ? (
                                        <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
                                            {alerts.map((alert, index) => (
                                                <li key={index}>
                                                    <button 
                                                        onClick={() => onJumpToMember(alert.userName)}
                                                        className="w-full flex items-center justify-between p-3 rounded-md border border-slate-200 hover:bg-slate-50 transition text-left"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <BellIcon className={`w-5 h-5 ${alert.type === 'overdue' ? 'text-red-500' : 'text-yellow-500'}`} />
                                                            <div>
                                                                <span className="font-medium text-[#0193be]">{alert.userName}</span>
                                                                <p className="text-sm text-slate-600">{alert.message}</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRightIcon className="w-5 h-5 text-slate-400" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="text-center py-10">
                                            <p className="text-slate-500">アラートはありません。</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'users' && (
                                <div role="tabpanel" aria-labelledby="tab-users">
                                    <div className="flex justify-end mb-4">
                                        <button onClick={() => setIsAddUserModalOpen(true)} className="bg-[#0193be] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#017a9a] transition">
                                            ユーザーを追加
                                        </button>
                                    </div>
                                    
                                    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-2">
                                        {localUsers.map(user => {
                                            const isMarkedForDeletion = usersToDelete.has(user.name);
                                            return (
                                                <li 
                                                    key={user.name} 
                                                    className={`flex items-center justify-between p-2 rounded-md border transition-all duration-300 ${
                                                        isMarkedForDeletion
                                                            ? 'bg-red-50 border-red-200 opacity-60'
                                                            : (isDraggingOver === user.name
                                                                ? 'bg-sky-100 border-sky-400 border-dashed ring-2 ring-sky-200'
                                                                : 'bg-slate-50 border-slate-200')
                                                    }`}
                                                    onDragOver={handleDragOver}
                                                    onDragEnter={(e) => handleDragEnter(e, user.name)}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDrop(e, user.name)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative group w-10 h-10 flex-shrink-0">
                                                            {isDraggingOver === user.name ? (
                                                                <div className="w-10 h-10 rounded-full bg-sky-200 flex flex-col items-center justify-center text-sky-600">
                                                                    <CloudArrowUpIcon className="w-6 h-6" />
                                                                </div>
                                                            ) : user.profilePicture ? (
                                                                <>
                                                                    <img src={user.profilePicture} alt={user.name} className="w-10 h-10 rounded-full object-cover"/>
                                                                    <button 
                                                                        onClick={(e) => handleRemovePicture(e, user.name)}
                                                                        className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        title="画像を削除"
                                                                    >
                                                                        <TrashIcon className="w-5 h-5" />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                                                    <UserIcon className="w-6 h-6" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className={`text-[#0193be] text-sm font-medium ${isMarkedForDeletion ? 'line-through' : ''}`}>{user.name}</span>
                                                            {user.createdAt && (
                                                                <span className="block text-xs text-[#0193be]/70">
                                                                    登録日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2 text-xs text-slate-600 border-r border-slate-300 pr-2">
                                                            <span className="font-medium mr-1">商材:</span>
                                                            {AVAILABLE_PRODUCTS.map(product => {
                                                                const currentProducts = user.availableProducts || [];
                                                                const isChecked = currentProducts.includes(product);
                                                                const handleProductChange = () => {
                                                                    const newProducts = isChecked
                                                                        ? currentProducts.filter(p => p !== product)
                                                                        : [...currentProducts, product];
                                                                    if (newProducts.length === 0) {
                                                                        alert('案内可能商材を少なくとも1つ選択する必要があります。');
                                                                        return;
                                                                    }
                                                                    handleUpdateAvailableProducts(user.name, newProducts);
                                                                };
                                                                return (
                                                                    <label key={product} className="flex items-center gap-1 cursor-pointer hover:text-[#0193be]">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={handleProductChange}
                                                                            className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be] focus:ring-offset-1"
                                                                        />
                                                                        {product}
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-slate-600 border-r border-slate-300 pr-3">
                                                          <label className="flex items-center gap-2 cursor-pointer hover:text-[#0193be]">
                                                              <input
                                                                  type="checkbox"
                                                                  checked={!!user.isLinePrechecker}
                                                                  onChange={() => handleToggleLinePrechecker(user.name)}
                                                                  className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be] focus:ring-offset-1"
                                                              />
                                                              回線前確者
                                                          </label>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setResettingUser(user)}
                                                                disabled={user.name === currentUser.name}
                                                                className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="パスワードを初期化"
                                                            >
                                                                <KeyIcon className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handlePictureUploadClick(user.name)}
                                                                className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-[#0193be] transition"
                                                                title="プロフィール画像を変更"
                                                            >
                                                                <CameraIcon className="w-5 h-5" />
                                                            </button>
                                                            {isSuperAdmin && (
                                                                <button
                                                                    onClick={() => handleToggleSuperAdmin(user.name)}
                                                                    disabled={user.name === currentUser.name}
                                                                    className={`p-1.5 rounded-full transition ${user.isSuperAdmin ? 'text-yellow-500 bg-yellow-100' : 'text-slate-500 hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                                    title={user.isSuperAdmin ? 'SA権限を剥奪' : 'SA権限を付与'}
                                                                >
                                                                    <StarIcon className="w-5 h-5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleToggleAdmin(user.name)}
                                                                disabled={user.name === currentUser.name || user.isSuperAdmin}
                                                                className={`p-1.5 rounded-full transition ${user.isAdmin ? 'text-green-600 bg-green-100' : 'text-slate-500 hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                                title={user.isSuperAdmin ? 'SAは管理者である必要があります' : (user.isAdmin ? '管理者権限を剥奪' : '管理者権限を付与')}
                                                            >
                                                                <ShieldCheckIcon className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                        <div className="pl-2 border-l border-slate-300">
                                                            <button
                                                                onClick={() => handleDeleteToggle(user.name)}
                                                                disabled={user.name === currentUser.name || user.isSuperAdmin}
                                                                className={`p-1.5 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                                                    isMarkedForDeletion 
                                                                        ? 'text-yellow-600 hover:bg-yellow-100' 
                                                                        : 'text-slate-500 hover:bg-red-100 hover:text-red-600'
                                                                }`}
                                                                title={user.name === currentUser.name || user.isSuperAdmin ? 'このユーザーは削除できません' : (isMarkedForDeletion ? '削除をキャンセル' : `${user.name}さんを削除`)}
                                                            >
                                                                <TrashIcon className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            {activeTab === 'tasks' && (
                                <div role="tabpanel" aria-labelledby="tab-tasks">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleSelectByProduct('回線')} className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 transition">回線</button>
                                            <button onClick={() => handleSelectByProduct('水')} className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 transition">水</button>
                                            <button onClick={handleSelectAllTasks} className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 transition">すべてにチェック</button>
                                            <button onClick={handleClearAllTasks} className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-100 transition">すべてクリア</button>
                                        </div>
                                        <button 
                                            onClick={() => setIsTaskModalOpen(true)} 
                                            disabled={selectedUsersForTask.size === 0}
                                            className="bg-[#0193be] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#017a9a] transition disabled:bg-slate-400 disabled:cursor-not-allowed"
                                        >
                                            作成 ({selectedUsersForTask.size})
                                        </button>
                                    </div>
                                    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-2 border border-slate-200 rounded-md p-2">
                                        {localUsers.map(user => (
                                            <li key={user.name}>
                                                <label className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 cursor-pointer transition">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedUsersForTask.has(user.name)}
                                                        onChange={() => handleToggleUserForTask(user.name)}
                                                        className="h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                                                    />
                                                     <div className="relative group w-8 h-8 flex-shrink-0">
                                                        {user.profilePicture ? (
                                                            <img src={user.profilePicture} alt={user.name} className="w-8 h-8 rounded-full object-cover"/>
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                                                <UserIcon className="w-5 h-5" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[#0193be] text-sm font-medium">{user.name}</span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                             {activeTab === 'announcement' && (
                                <div role="tabpanel" aria-labelledby="tab-announcement">
                                    <h3 className="sr-only">周知事項</h3>
                                    <form onSubmit={handleSetAnnouncement} className="space-y-3 max-w-sm">
                                        <div>
                                            <label className="block text-sm font-medium text-[#0193be]/80 mb-1">表示するメッセージ (空にすると非表示)</label>
                                            <textarea
                                                value={announcementText}
                                                onChange={(e) => setAnnouncementText(e.target.value)}
                                                rows={5}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"
                                            />
                                        </div>
                                        <div className="text-right pt-2">
                                            <button type="submit" className="bg-slate-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-700 transition">更新</button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {isSuperAdmin && activeTab === 'version' && (
                                <div role="tabpanel" aria-labelledby="tab-version">
                                    <h3 className="sr-only">バージョン</h3>
                                    <form onSubmit={handleSetVersion} className="space-y-3 max-w-sm">
                                        <div>
                                            <label htmlFor="app-version-input" className="block text-sm font-medium text-[#0193be]/80 mb-1">バージョン名</label>
                                            <input
                                                id="app-version-input"
                                                type="text"
                                                value={versionText}
                                                onChange={(e) => setVersionText(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"
                                                placeholder="例: ver 3.0.0"
                                            />
                                        </div>
                                        <div className="text-right pt-2">
                                            <button type="submit" className="bg-slate-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-700 transition">更新</button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {activeTab === 'users' && (
                    <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3 flex-shrink-0">
                        <button onClick={onClose} className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-6 rounded-lg hover:bg-slate-50 transition">
                            キャンセル
                        </button>
                        <button onClick={handleSave} className="bg-[#0193be] text-white font-bold py-2 px-6 rounded-lg hover:bg-[#017a9a] transition">
                            保存
                        </button>
                    </div>
                )}
            </div>
            
            {isAddUserModalOpen && (
                <AddUserModal
                    onClose={() => setIsAddUserModalOpen(false)}
                    onAddUser={handleAddUser}
                    availableProductsOptions={AVAILABLE_PRODUCTS}
                />
            )}

            {isTaskModalOpen && (
                <BulkTaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => setIsTaskModalOpen(false)}
                    onSubmit={handleBulkTaskSubmit}
                    selectedMemberCount={selectedUsersForTask.size}
                />
            )}

            <ConfirmationModal
                isOpen={!!resettingUser}
                onClose={() => setResettingUser(null)}
                onConfirm={() => {
                    if (resettingUser) {
                    onResetUserPassword(resettingUser.name);
                    setResettingUser(null);
                    }
                }}
                title="パスワードリセットの確認"
            >
                {resettingUser && (
                    <div>
                    <p>
                        <strong className="text-slate-800">{resettingUser.name}</strong> さんのパスワードを初期化しますか？
                    </p>
                    <p className="mt-2 text-sm">
                        リセット後のパスワードは
                        <strong className="text-red-600 mx-1">
                        {resettingUser.name === ADMIN_USER_NAME ? NAKAGOMI_INITIAL_PASSWORD : DEFAULT_INITIAL_PASSWORD}
                        </strong>
                        になります。
                    </p>
                    </div>
                )}
            </ConfirmationModal>

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
                @keyframes fade-in-up {
                  from { opacity: 0; transform: translateY(20px) scale(0.95); }
                  to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-fade-in-up {
                  animation: fade-in-up 0.3s ease-out forwards;
                }
            `}</style>
        </div>,
        document.body
    );
};

export default AdminMenu;