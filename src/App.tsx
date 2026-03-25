/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  increment,
  addDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { 
  Camera, 
  Heart, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Image as ImageIcon, 
  LogOut,
  LogIn,
  Layers,
  Palette,
  Mountain,
  Trees,
  User as UserIcon,
  Droplets,
  Sun,
  Shield,
  Plus,
  Users,
  Check,
  AlertCircle,
  Pencil,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { Category, Photo, Like, OperationType, FirestoreErrorInfo } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'Mountain': return <Mountain className="w-6 h-6" />;
    case 'Trees': return <Trees className="w-6 h-6" />;
    case 'Layers': return <Layers className="w-6 h-6" />;
    case 'UserIcon': return <UserIcon className="w-6 h-6" />;
    case 'Camera': return <Camera className="w-6 h-6" />;
    case 'Droplets': return <Droplets className="w-6 h-6" />;
    case 'Sun': return <Sun className="w-6 h-6" />;
    case 'Palette': return <Palette className="w-6 h-6" />;
    case 'Heart': return <Heart className="w-6 h-6" />;
    default: return <Camera className="w-6 h-6" />;
  }
};

const LIKED_CATEGORY: Category = {
  id: 'liked-images',
  name: 'Liked Images',
  icon: 'Heart',
  isLikedCategory: true
};

// Error handling helper
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  const [userLikes, setUserLikes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [photoToEdit, setPhotoToEdit] = useState<Photo | null>(null);
  const isSeeding = useRef(false);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Fetch categories
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats);
      setLoading(false);
      
      // Seed data if empty and user is admin
      if (cats.length === 0 && isAuthReady && user?.email === 'khotusoni@gmail.com') {
        seedInitialData();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Fetch photos based on selection
  useEffect(() => {
    setLoading(true);
    if (selectedCategory?.isLikedCategory) {
      const likedPhotoIds = Object.keys(userLikes);
      if (likedPhotoIds.length === 0) {
        setPhotos([]);
        setLoading(false);
        return;
      }
      
      // Firestore 'in' query limit is 30. For simplicity, we'll fetch the first 30.
      const q = query(collection(db, 'photos'), where('__name__', 'in', likedPhotoIds.slice(0, 30)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const pts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
        setPhotos(pts);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'photos');
      });
      return () => unsubscribe();
    }

    let q = query(collection(db, 'photos'));
    if (selectedCategory) {
      q = query(q, where('categoryId', '==', selectedCategory.id));
    }
    if (selectedSubcategory) {
      q = query(q, where('subcategory', '==', selectedSubcategory));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      setPhotos(pts);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'photos');
    });
    return () => unsubscribe();
  }, [selectedCategory, selectedSubcategory, userLikes]);

  // Fetch user likes
  useEffect(() => {
    if (!user) {
      setUserLikes({});
      setIsAdmin(false);
      setIsMasterAdmin(false);
      return;
    }

    if (user.email === 'khotusoni@gmail.com') {
      setIsAdmin(true);
      setIsMasterAdmin(true);
    }

    // Check if user is promoted admin
    const adminUnsubscribe = onSnapshot(doc(db, 'promoted_admins', user.email || ''), (doc) => {
      if (doc.exists()) {
        setIsAdmin(true);
      }
    });

    const q = query(collection(db, 'likes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const likesMap: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Like;
        likesMap[data.photoId] = true;
      });
      setUserLikes(likesMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'likes');
    });
    return () => {
      unsubscribe();
      adminUnsubscribe();
    };
  }, [user]);

  // Handle auto-hiding Liked category if no likes exist
  useEffect(() => {
    if (selectedCategory?.isLikedCategory && Object.keys(userLikes).length === 0) {
      setSelectedCategory(null);
    }
  }, [userLikes, selectedCategory]);

  const seedInitialData = async () => {
    if (isSeeding.current) return;
    isSeeding.current = true;
    
    const initialCategories = [
      { name: 'Landscape', icon: 'Mountain', subcategories: ['Mountains', 'Canyons', 'Deserts'] },
      { name: 'Wildlife', icon: 'Trees', subcategories: ['Birds', 'Mammals', 'Reptiles'] },
      { name: 'Architecture', icon: 'Layers', subcategories: ['Modern', 'Gothic', 'Minimalist'] },
      { name: 'Portrait', icon: 'UserIcon', subcategories: ['Studio', 'Street', 'Candid'] },
      { name: 'Street', icon: 'Camera', subcategories: ['Night', 'People', 'Urban'] },
      { name: 'Macro', icon: 'Droplets', subcategories: ['Insects', 'Flowers', 'Textures'] },
      { name: 'Astro', icon: 'Sun', subcategories: ['Milky Way', 'Deep Space', 'Moon'] },
      { name: 'Fine Art', icon: 'Palette', subcategories: ['Abstract', 'Surreal', 'Conceptual'] },
    ];

    try {
      for (const cat of initialCategories) {
        const docRef = await addDoc(collection(db, 'categories'), cat);
        // Add some sample photos for each category
        for (let i = 1; i <= 3; i++) {
          await addDoc(collection(db, 'photos'), {
            url: `https://picsum.photos/seed/${cat.name}${i}/1200/800`,
            title: `${cat.name} Sample ${i}`,
            categoryId: docRef.id,
            subcategory: cat.subcategories[i-1] || cat.subcategories[0],
            likes: Math.floor(Math.random() * 100),
            author: 'Virazz FX Studio Artist'
          });
        }
      }
    } catch (error) {
      console.error('Error seeding data:', error);
    } finally {
      isSeeding.current = false;
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const toggleLike = async (photo: Photo) => {
    if (!user) {
      handleLogin();
      return;
    }

    const likeId = `${user.uid}_${photo.id}`;
    const likeRef = doc(db, 'likes', likeId);
    const photoRef = doc(db, 'photos', photo.id);

    try {
      if (userLikes[photo.id]) {
        await deleteDoc(likeRef);
        await updateDoc(photoRef, { likes: increment(-1) });
      } else {
        await setDoc(likeRef, { userId: user.uid, photoId: photo.id });
        await updateDoc(photoRef, { likes: increment(1) });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'likes');
    }
  };

  const nextPhoto = () => {
    if (viewingPhotoIndex !== null && viewingPhotoIndex < photos.length - 1) {
      setViewingPhotoIndex(viewingPhotoIndex + 1);
    }
  };

  const prevPhoto = () => {
    if (viewingPhotoIndex !== null && viewingPhotoIndex > 0) {
      setViewingPhotoIndex(viewingPhotoIndex - 1);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-neutral-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => {
              setSelectedCategory(null);
              setSelectedSubcategory(null);
            }}
          >
            <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center text-white group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Virazz FX Studio</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && isAdmin && (
              <button 
                onClick={() => setShowAdminPanel(true)}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-600"
                title="Admin Panel"
              >
                <Shield className="w-5 h-5" />
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <img 
                  src={user.photoURL || ''} 
                  alt={user.displayName || ''} 
                  className="w-8 h-8 rounded-full border border-neutral-200"
                />
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-full text-sm font-medium hover:bg-neutral-800 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-neutral-200 border-t-neutral-900 rounded-full mb-4"
            />
            <p className="text-neutral-400 text-sm font-medium animate-pulse">Loading Studio Content...</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Navigation Breadcrumbs */}
            {(selectedCategory || selectedSubcategory) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-8 text-sm text-neutral-500"
          >
            <button 
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
              }}
              className="hover:text-neutral-900 transition-colors"
            >
              All Categories
            </button>
            {selectedCategory && (
              <>
                <ChevronRight className="w-4 h-4" />
                <button 
                  onClick={() => setSelectedSubcategory(null)}
                  className={cn(
                    "hover:text-neutral-900 transition-colors",
                    !selectedSubcategory && "text-neutral-900 font-medium"
                  )}
                >
                  {selectedCategory.name}
                </button>
              </>
            )}
            {selectedSubcategory && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-neutral-900 font-medium">{selectedSubcategory}</span>
              </>
            )}
          </motion.div>
        )}

        {/* Categories Grid */}
        {!selectedCategory && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
            {user && Object.keys(userLikes).length > 0 && (
              <motion.button
                key={LIKED_CATEGORY.id}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedCategory(LIKED_CATEGORY)}
                className="group flex flex-col gap-3"
              >
                <div className="relative aspect-square bg-white border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all overflow-hidden">
                  <div className="w-full h-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
                    <div className="w-12 h-12 flex items-center justify-center">
                      <Heart className="w-8 h-8" />
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-center">
                  <span className="font-bold text-sm text-neutral-900 tracking-tight group-hover:text-neutral-600 transition-colors">
                    {LIKED_CATEGORY.name}
                  </span>
                </div>
              </motion.button>
            )}
            {categories.map((cat) => (
              <motion.button
                key={cat.id}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedCategory(cat)}
                className="group flex flex-col gap-3"
              >
                <div className="relative aspect-square bg-white border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all overflow-hidden">
                  {cat.thumbnail ? (
                    <img 
                      src={cat.thumbnail} 
                      alt={cat.name} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                      <div className="w-12 h-12 flex items-center justify-center">
                        {getIcon(cat.icon)}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col items-center">
                  <span className="font-bold text-sm text-neutral-900 tracking-tight group-hover:text-neutral-600 transition-colors">
                    {cat.name}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {/* Subcategories Horizontal Scroll */}
        {selectedCategory && (
          <div className="flex gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar">
            <button
              onClick={() => setSelectedSubcategory(null)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                !selectedSubcategory 
                  ? "bg-neutral-900 text-white" 
                  : "bg-white border border-neutral-100 hover:bg-neutral-50"
              )}
            >
              All {selectedCategory.name}
            </button>
            {selectedCategory.subcategories?.map((sub) => (
              <button
                key={sub}
                onClick={() => setSelectedSubcategory(sub)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                  selectedSubcategory === sub
                    ? "bg-neutral-900 text-white"
                    : "bg-white border border-neutral-100 hover:bg-neutral-50"
                )}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Photos Grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {photos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative aspect-[4/5] bg-neutral-200 rounded-3xl overflow-hidden cursor-pointer"
                  onClick={() => setViewingPhotoIndex(index)}
                >
                  <img 
                    src={photo.url} 
                    alt={photo.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    <h3 className="text-white font-medium text-lg">{photo.title}</h3>
                    <p className="text-white/70 text-sm">{photo.author}</p>
                    {isAdmin && (
                      <div className="absolute top-4 right-4 flex gap-2" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => {
                            setPhotoToEdit(photo);
                            setShowAdminPanel(true);
                          }}
                          className="p-2 bg-white/20 backdrop-blur-md text-white rounded-xl hover:bg-white/40 transition-all"
                          title="Edit Photo"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await deleteDoc(doc(db, 'photos', photo.id));
                            } catch (error) {
                              console.error('Delete error:', error);
                            }
                          }}
                          className="p-2 bg-red-500/80 backdrop-blur-md text-white rounded-xl hover:bg-red-500 transition-all"
                          title="Delete Photo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {photos.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p>No photos found in this category.</p>
          </div>
        )}
          </>
        )}
      </main>

      {/* Full Screen Viewer */}
      <AnimatePresence>
        {viewingPhotoIndex !== null && photos[viewingPhotoIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Viewer Header */}
            <div className="flex items-center justify-between p-4 text-white">
              <button 
                onClick={() => setViewingPhotoIndex(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="text-center">
                <h2 className="font-medium">{photos[viewingPhotoIndex].title}</h2>
                <p className="text-xs text-white/50">{photos[viewingPhotoIndex].author}</p>
              </div>
              <div className="w-10" /> {/* Spacer */}
            </div>

            {/* Main Image Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.img
                  key={photos[viewingPhotoIndex].id}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  src={photos[viewingPhotoIndex].url}
                  alt={photos[viewingPhotoIndex].title}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              </AnimatePresence>

              {/* Navigation Arrows */}
              <button 
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                disabled={viewingPhotoIndex === 0}
                className="absolute left-4 p-4 text-white/50 hover:text-white disabled:opacity-0 transition-all"
              >
                <ChevronLeft className="w-10 h-10" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                disabled={viewingPhotoIndex === photos.length - 1}
                className="absolute right-4 p-4 text-white/50 hover:text-white disabled:opacity-0 transition-all"
              >
                <ChevronRight className="w-10 h-10" />
              </button>
            </div>

            {/* Viewer Footer */}
            <div className="p-8 flex items-center justify-center gap-8 text-white">
              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => toggleLike(photos[viewingPhotoIndex])}
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90",
                    userLikes[photos[viewingPhotoIndex].id]
                      ? "bg-red-500 text-white shadow-lg shadow-red-500/40"
                      : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <Heart className={cn("w-8 h-8", userLikes[photos[viewingPhotoIndex].id] && "fill-current")} />
                </button>
                <span className="text-sm font-medium">{photos[viewingPhotoIndex].likes} likes</span>
              </div>
            </div>

            {/* Swipe Instructions (Mobile) */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-white/30 text-xs pointer-events-none">
              Swipe or use arrows to navigate
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      {!viewingPhotoIndex && (
        <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-neutral-100 text-center text-neutral-400 text-sm">
          <p>&copy; 2026 Virazz FX Studio. All rights reserved.</p>
        </footer>
      )}

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdminPanel && (
          <AdminPanel 
            onClose={() => {
              setShowAdminPanel(false);
              setPhotoToEdit(null);
            }} 
            categories={categories}
            isMasterAdmin={isMasterAdmin}
            initialPhotoToEdit={photoToEdit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminPanel({ 
  onClose, 
  categories, 
  isMasterAdmin,
  initialPhotoToEdit
}: { 
  onClose: () => void; 
  categories: Category[]; 
  isMasterAdmin: boolean;
  initialPhotoToEdit?: Photo | null;
}) {
  const [activeTab, setActiveTab] = useState<'photos' | 'categories' | 'admins'>('photos');
  const [newPhoto, setNewPhoto] = useState({
    title: '',
    url: '',
    categoryId: '',
    subcategory: '',
    author: ''
  });
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [newCategory, setNewCategory] = useState({
    name: '',
    icon: 'Camera',
    thumbnail: '',
    subcategories: ''
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (activeTab === 'photos') {
      const q = query(collection(db, 'photos'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const pts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
        setAllPhotos(pts);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const startEditingPhoto = (photo: Photo) => {
    setEditingPhotoId(photo.id);
    setNewPhoto({
      title: photo.title,
      url: photo.url,
      categoryId: photo.categoryId,
      subcategory: photo.subcategory || '',
      author: photo.author || ''
    });
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (initialPhotoToEdit) {
      setActiveTab('photos');
      startEditingPhoto(initialPhotoToEdit);
    }
  }, [initialPhotoToEdit]);

  const cancelEditingPhoto = () => {
    setEditingPhotoId(null);
    setNewPhoto({
      title: '',
      url: '',
      categoryId: '',
      subcategory: '',
      author: ''
    });
  };

  const startEditingCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setNewCategory({
      name: cat.name,
      icon: cat.icon,
      thumbnail: cat.thumbnail || '',
      subcategories: cat.subcategories?.join(', ') || ''
    });
    // Scroll to top of categories tab
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditingCategory = () => {
    setEditingCategoryId(null);
    setNewCategory({
      name: '',
      icon: 'Camera',
      thumbnail: '',
      subcategories: ''
    });
  };

  const handleSubmitPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoto.title || !newPhoto.url || !newPhoto.categoryId) {
      setStatus({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }
    try {
      const photoData = {
        ...newPhoto,
        author: newPhoto.author || 'Virazz FX Studio'
      };

      if (editingPhotoId) {
        await updateDoc(doc(db, 'photos', editingPhotoId), photoData);
        setStatus({ type: 'success', message: 'Photo updated successfully!' });
      } else {
        await addDoc(collection(db, 'photos'), {
          ...photoData,
          likes: 0
        });
        setStatus({ type: 'success', message: 'Photo added successfully!' });
      }
      
      cancelEditingPhoto();
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: editingPhotoId ? 'Failed to update photo.' : 'Failed to add photo.' });
    }
  };

  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name || !newCategory.thumbnail) {
      setStatus({ type: 'error', message: 'Name and Thumbnail URL are required.' });
      return;
    }

    setStatus({ type: 'success', message: 'Validating thumbnail dimensions...' });

    try {
      // Validate dimensions of the URL image
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Thumbnail validation timed out. Please check the URL.')), 10000);
        img.onload = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load thumbnail from URL. Ensure it is a direct image link.'));
        };
        img.src = newCategory.thumbnail;
      });

      if (img.width !== 512 || img.height !== 512) {
        setStatus({ type: 'error', message: `Thumbnail must be exactly 512x512 pixels. This image is ${img.width}x${img.height}.` });
        return;
      }

      const categoryData = {
        name: newCategory.name,
        icon: 'Camera',
        thumbnail: newCategory.thumbnail,
        subcategories: newCategory.subcategories.split(',').map(s => s.trim()).filter(s => s !== '')
      };

      if (editingCategoryId) {
        await updateDoc(doc(db, 'categories', editingCategoryId), categoryData);
        setStatus({ type: 'success', message: 'Category updated successfully!' });
      } else {
        await addDoc(collection(db, 'categories'), categoryData);
        setStatus({ type: 'success', message: 'Category added successfully!' });
      }
      
      cancelEditingCategory();
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: editingCategoryId ? 'Failed to update category.' : 'Failed to add category.' });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
      setStatus({ type: 'success', message: 'Category deleted successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to delete category.' });
    }
  };

  const handleDeletePhoto = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'photos', id));
      setStatus({ type: 'success', message: 'Photo deleted successfully!' });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to delete photo.' });
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    try {
      await setDoc(doc(db, 'promoted_admins', newAdminEmail), {
        email: newAdminEmail,
        promotedBy: auth.currentUser?.email,
        at: new Date().toISOString()
      });
      setStatus({ type: 'success', message: `${newAdminEmail} promoted to Admin!` });
      setNewAdminEmail('');
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to promote user.' });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Admin Panel</h2>
              <p className="text-sm text-neutral-500">Manage your studio content</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-neutral-100">
          <button 
            onClick={() => setActiveTab('photos')}
            className={cn(
              "flex-1 py-4 text-sm font-medium transition-colors border-b-2",
              activeTab === 'photos' ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"
            )}
          >
            Photos
          </button>
          <button 
            onClick={() => setActiveTab('categories')}
            className={cn(
              "flex-1 py-4 text-sm font-medium transition-colors border-b-2",
              activeTab === 'categories' ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"
            )}
          >
            Categories
          </button>
          {isMasterAdmin && (
            <button 
              onClick={() => setActiveTab('admins')}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-colors border-b-2",
                activeTab === 'admins' ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"
              )}
            >
              Admins
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {status && (
            <div className={cn(
              "mb-6 p-4 rounded-2xl flex items-center gap-3 text-sm font-medium",
              status.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            )}>
              {status.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {status.message}
            </div>
          )}

          {activeTab === 'photos' ? (
            <div className="space-y-8">
              <form onSubmit={handleSubmitPhoto} className="space-y-4 p-6 bg-neutral-50 rounded-3xl border border-neutral-100">
                <h3 className="font-bold flex items-center gap-2 mb-4">
                  {editingPhotoId ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingPhotoId ? 'Edit Photo Details' : 'Add New Photo'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Photo Title</label>
                    <input 
                      type="text" 
                      value={newPhoto.title}
                      onChange={e => setNewPhoto({...newPhoto, title: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="E.g. Neon Sunset"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Author Name</label>
                    <input 
                      type="text" 
                      value={newPhoto.author}
                      onChange={e => setNewPhoto({...newPhoto, author: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="Virazz FX Studio"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Photo Image URL</label>
                  <div className="flex flex-col gap-4">
                    {newPhoto.url && (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-neutral-100">
                        <img 
                          src={newPhoto.url} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                        <button 
                          type="button"
                          onClick={() => setNewPhoto(prev => ({ ...prev, url: '' }))}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <input 
                      type="url" 
                      value={newPhoto.url}
                      onChange={e => setNewPhoto({...newPhoto, url: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="https://images.unsplash.com/..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Category</label>
                    <select 
                      value={newPhoto.categoryId}
                      onChange={e => {
                        const cat = categories.find(c => c.id === e.target.value);
                        setNewPhoto({...newPhoto, categoryId: e.target.value, subcategory: cat?.subcategories?.[0] || ''});
                      }}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all appearance-none"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Subcategory</label>
                    <select 
                      value={newPhoto.subcategory}
                      onChange={e => setNewPhoto({...newPhoto, subcategory: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all appearance-none"
                      disabled={!newPhoto.categoryId}
                    >
                      <option value="">Select Subcategory</option>
                      {categories.find(c => c.id === newPhoto.categoryId)?.subcategories?.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
                  >
                    {editingPhotoId ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {editingPhotoId ? 'Update Photo' : 'Add Photo to Gallery'}
                  </button>
                  {editingPhotoId && (
                    <button 
                      type="button"
                      onClick={cancelEditingPhoto}
                      className="px-6 py-4 bg-neutral-200 text-neutral-900 rounded-2xl font-bold hover:bg-neutral-300 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 px-2">
                  <ImageIcon className="w-5 h-5" />
                  Manage Photos ({allPhotos.length})
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {allPhotos.map(photo => (
                    <div key={photo.id} className="flex items-center justify-between p-3 bg-white border border-neutral-100 rounded-2xl">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-neutral-100 rounded-lg overflow-hidden flex-shrink-0">
                          <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{photo.title}</p>
                          <p className="text-xs text-neutral-400 truncate">
                            {categories.find(c => c.id === photo.categoryId)?.name} • {photo.subcategory}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => startEditingPhoto(photo)}
                          className="p-2 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 rounded-lg transition-all"
                          title="Edit Photo"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Photo"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'categories' ? (
            <div className="space-y-8">
              <form onSubmit={handleSubmitCategory} className="space-y-4 p-6 bg-neutral-50 rounded-3xl border border-neutral-100">
                <h3 className="font-bold flex items-center gap-2 mb-4">
                  {editingCategoryId ? <Pencil className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                  {editingCategoryId ? 'Edit Category' : 'Add New Category'}
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Category Name</label>
                    <input 
                      type="text" 
                      value={newCategory.name}
                      onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="E.g. Cyberpunk"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Category Thumbnail URL (Required: 512x512)</label>
                  <div className="flex flex-col gap-4">
                    {newCategory.thumbnail && (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-neutral-100">
                        <img 
                          src={newCategory.thumbnail} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                        <button 
                          type="button"
                          onClick={() => setNewCategory(prev => ({ ...prev, thumbnail: '' }))}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <input 
                      type="url" 
                      value={newCategory.thumbnail}
                      onChange={e => setNewCategory({...newCategory, thumbnail: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="https://images.unsplash.com/..."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Subcategories (Comma separated)</label>
                  <input 
                    type="text" 
                    value={newCategory.subcategories}
                    onChange={e => setNewCategory({...newCategory, subcategories: e.target.value})}
                    className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    placeholder="Neon, Urban, Night"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
                  >
                    {editingCategoryId ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {editingCategoryId ? 'Update Category' : 'Create Category'}
                  </button>
                  {editingCategoryId && (
                    <button 
                      type="button"
                      onClick={cancelEditingCategory}
                      className="px-6 py-4 bg-neutral-200 text-neutral-900 rounded-2xl font-bold hover:bg-neutral-300 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 px-2">
                  <Layers className="w-5 h-5" />
                  Existing Categories
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400">
                          {getIcon(cat.icon)}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{cat.name}</p>
                          <p className="text-xs text-neutral-400">{cat.subcategories?.length || 0} subcategories</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => startEditingCategory(cat)}
                          className="p-2 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 rounded-lg transition-all"
                          title="Edit Category"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-6 bg-neutral-50 rounded-3xl border border-neutral-100">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Promote New Admin
                </h3>
                <p className="text-sm text-neutral-500 mb-4">Enter the email address of the user you want to promote to Admin status.</p>
                <form onSubmit={handleAddAdmin} className="flex gap-2">
                  <input 
                    type="email" 
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    className="flex-1 px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    placeholder="user@example.com"
                  />
                  <button 
                    type="submit"
                    className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all"
                  >
                    Promote
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
