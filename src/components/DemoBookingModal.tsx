import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Clock, User, Phone, Mail, Baby, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { emailService } from '@/services/emailService';

interface DemoBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BookingData {
  parentName: string;
  phone: string;
  email: string;
  childName: string;
  childAge: number;
  selectedDate: Date | null;
  selectedTime: string;
}

interface ValidationErrors {
  parentName?: string;
  phone?: string;
  email?: string;
  childName?: string;
}

// Hafta içi ve hafta sonu saat seçeneklerini dinamik olarak oluştur
const getTimeSlots = (date: Date | null) => {
  if (!date) return [];
  
  const dayOfWeek = date.getDay(); // 0 = Pazar, 1 = Pazartesi, ..., 6 = Cumartesi
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Pazar veya Cumartesi
  
  if (isWeekend) {
    // Hafta sonu: 10:00 - 21:00
    return ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
  } else {
    // Hafta içi: 18:00 - 21:00
    return ['18:00', '19:00', '20:00', '21:00'];
  }
};

const ageOptions = [
  { value: 9, label: '< 10', disabled: true },
  { value: 10, label: '10' },
  { value: 11, label: '11' },
  { value: 12, label: '12' },
  { value: 13, label: '13' },
  { value: 14, label: '14' },
  { value: 15, label: '15' },
  { value: 16, label: '16' },
  { value: 17, label: '17' },
  { value: 18, label: '> 17', disabled: true }
];

export const DemoBookingModal = ({ isOpen, onClose }: DemoBookingModalProps) => {
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState<BookingData>({
    parentName: '',
    phone: '',
    email: '',
    childName: '',
    childAge: 0,
    selectedDate: null,
    selectedTime: ''
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Validation fonksiyonları
  const validateParentName = (name: string): string => {
    if (!name.trim()) return 'Ad ve soyad gereklidir';
    
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length < 2) return 'Lütfen ad ve soyadınızı giriniz';
    
    for (const part of nameParts) {
      if (part.length < 2) return 'Ad ve soyad en az 2 harften oluşmalıdır';
      if (!/^[a-zA-ZğĞıİöÖüÜşŞçÇ]+$/.test(part)) return 'Sadece harfler kullanabilirsiniz';
    }
    
    return '';
  };

  const validatePhone = (phone: string): string => {
    if (!phone.trim()) return 'Telefon numarası gereklidir';
    
    // +90 5xx xxx xx xx formatını kontrol et
    const phoneRegex = /^\+90\s5\d{2}\s\d{3}\s\d{2}\s\d{2}$/;
    if (!phoneRegex.test(phone)) return 'Lütfen +90 5xx xxx xx xx formatında giriniz';
    
    return '';
  };

  const validateEmail = (email: string): string => {
    if (!email.trim()) return 'E-posta adresi gereklidir';
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return 'Geçerli bir e-posta adresi giriniz';
    
    return '';
  };

  const validateChildName = (name: string): string => {
    if (!name.trim()) return 'Çocuğun adı gereklidir';
    
    const nameParts = name.trim().split(/\s+/);
    for (const part of nameParts) {
      if (part.length < 2) return 'İsim en az 2 harften oluşmalıdır';
      if (!/^[a-zA-ZğĞıİöÖüÜşŞçÇ]+$/.test(part)) return 'Sadece harfler kullanabilirsiniz';
    }
    
    return '';
  };

  // Telefon formatlaması
  const formatPhoneNumber = (value: string): string => {
    // Sadece rakamları al
    const numbers = value.replace(/\D/g, '');
    
    // Eğer 90 ile başlıyorsa veya 0 ile başlıyorsa düzenle
    let cleanNumbers = numbers;
    if (cleanNumbers.startsWith('90')) {
      cleanNumbers = cleanNumbers.substring(2);
    } else if (cleanNumbers.startsWith('0')) {
      cleanNumbers = cleanNumbers.substring(1);
    }
    
    // 5 ile başlamazsa ve boş değilse hata
    if (cleanNumbers.length > 0 && !cleanNumbers.startsWith('5')) {
      return value; // Geçersiz format, değiştirme
    }
    
    // Formatla: +90 5xx xxx xx xx
    if (cleanNumbers.length === 0) return '';
    if (cleanNumbers.length <= 3) return `+90 ${cleanNumbers}`;
    if (cleanNumbers.length <= 6) return `+90 ${cleanNumbers.slice(0, 3)} ${cleanNumbers.slice(3)}`;
    if (cleanNumbers.length <= 8) return `+90 ${cleanNumbers.slice(0, 3)} ${cleanNumbers.slice(3, 6)} ${cleanNumbers.slice(6)}`;
    if (cleanNumbers.length <= 10) return `+90 ${cleanNumbers.slice(0, 3)} ${cleanNumbers.slice(3, 6)} ${cleanNumbers.slice(6, 8)} ${cleanNumbers.slice(8)}`;
    
    // Maksimum 10 haneli
    return `+90 ${cleanNumbers.slice(0, 3)} ${cleanNumbers.slice(3, 6)} ${cleanNumbers.slice(6, 8)} ${cleanNumbers.slice(8, 10)}`;
  };

  const handleInputChange = (field: keyof BookingData, value: any) => {
    // Telefon alanı için özel formatlaması
    if (field === 'phone') {
      value = formatPhoneNumber(value);
    }

    setBookingData(prev => ({ 
      ...prev, 
      [field]: value,
      // Tarih değiştiğinde seçili saati sıfırla
      ...(field === 'selectedDate' && { selectedTime: '' })
    }));

    // Tarih seçildiğinde calendar'ı kapat
    if (field === 'selectedDate') {
      setIsCalendarOpen(false);
    }

    // Validation hatalarını temizle
    if (validationErrors[field as keyof ValidationErrors]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Tarih navigasyonu için fonksiyonlar
  const goToPreviousDay = () => {
    if (bookingData.selectedDate) {
      const previousDay = new Date(bookingData.selectedDate);
      previousDay.setDate(previousDay.getDate() - 1);
      // Geçmiş tarihlere gitmeyi engelle
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (previousDay.getTime() >= today.getTime()) {
        handleInputChange('selectedDate', previousDay);
      }
    }
  };

  const goToNextDay = () => {
    if (bookingData.selectedDate) {
      const nextDay = new Date(bookingData.selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      handleInputChange('selectedDate', nextDay);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      // Firebase'e veri kaydetme
      const docData = {
        // Veli Bilgileri
        parentName: bookingData.parentName,
        parentPhone: bookingData.phone,
        parentEmail: bookingData.email,
        
        // Çocuk Bilgileri
        childName: bookingData.childName,
        childAge: bookingData.childAge,
        
        // Ders Bilgileri
        selectedDate: bookingData.selectedDate ? format(bookingData.selectedDate, 'yyyy-MM-dd') : '',
        selectedTime: bookingData.selectedTime,
        
        // Sistem Bilgileri
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: 'pending',
        
        // Ek Bilgiler
        timeZone: 'Europe/Istanbul',
        dayOfWeek: bookingData.selectedDate ? format(bookingData.selectedDate, 'EEEE', { locale: tr }) : '',
        isWeekend: bookingData.selectedDate ? [0, 6].includes(bookingData.selectedDate.getDay()) : false,
        
        // Opsiyonel Alanlar
        notes: '',
        reminderSent: false,
        teacherAssigned: ''
      };

      // Firestore'a veri ekleme
      const docRef = await addDoc(collection(db, 'demo_bookings'), docData);
      
      console.log('Reservation saved with ID: ', docRef.id);
      console.log('Booking data:', docData);

      // E-posta bildirimi gönder
      try {
        const emailData = {
          parentName: bookingData.parentName,
          parentPhone: bookingData.phone,
          parentEmail: bookingData.email,
          childName: bookingData.childName,
          childAge: bookingData.childAge,
          selectedDate: bookingData.selectedDate ? format(bookingData.selectedDate, 'dd MMMM yyyy', { locale: tr }) : '',
          selectedTime: bookingData.selectedTime,
          timeZone: 'Europe/Istanbul',
          dayOfWeek: bookingData.selectedDate ? format(bookingData.selectedDate, 'EEEE', { locale: tr }) : '',
          status: 'pending',
          createdAt: new Date().toLocaleString('tr-TR'),
          bookingId: docRef.id
        };

        const emailSent = await emailService.sendDemoBookingNotification(emailData);
        if (emailSent) {
          console.log('✅ E-posta bildirimi başarıyla gönderildi!');
        } else {
          console.warn('⚠️ E-posta gönderilirken sorun oluştu, ancak rezervasyon kaydedildi.');
        }
      } catch (emailError) {
        console.error('E-posta gönderme hatası:', emailError);
        // E-posta hatası rezervasyon işlemini engellemez
      }
      
      setIsSubmitting(false);
      setIsSuccess(true);
    } catch (error) {
      console.error('Error saving reservation: ', error);
      setIsSubmitting(false);
      // Hata durumunda kullanıcıya bilgi verilebilir
      alert('Rezervasyon kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  // Step validation fonksiyonları
  const validateStep1 = (): boolean => {
    const errors: ValidationErrors = {};
    
    const parentNameError = validateParentName(bookingData.parentName);
    if (parentNameError) errors.parentName = parentNameError;
    
    const phoneError = validatePhone(bookingData.phone);
    if (phoneError) errors.phone = phoneError;
    
    const emailError = validateEmail(bookingData.email);
    if (emailError) errors.email = emailError;
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errors: ValidationErrors = {};
    
    const childNameError = validateChildName(bookingData.childName);
    if (childNameError) errors.childName = childNameError;
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0 && bookingData.childAge >= 10 && bookingData.childAge <= 17;
  };

  const handleNextStep = (currentStep: number) => {
    if (currentStep === 1) {
      if (validateStep1()) {
        setStep(2);
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setStep(3);
      }
    }
  };

  const resetModal = () => {
    setStep(1);
    setBookingData({
      parentName: '',
      phone: '',
      email: '',
      childName: '',
      childAge: 0,
      selectedDate: null,
      selectedTime: ''
    });
    setValidationErrors({});
    setIsSuccess(false);
    setIsSubmitting(false);
    setIsCalendarOpen(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const isStep1Valid = bookingData.parentName && bookingData.phone && bookingData.email && Object.keys(validationErrors).length === 0;
  const isStep2Valid = bookingData.childName && bookingData.childAge >= 10 && bookingData.childAge <= 17;
  const isStep3Valid = bookingData.selectedDate && bookingData.selectedTime;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-primary">
            {isSuccess ? 'Ders Hakkında Bilgi' : 'Deneme Dersi Planla'}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8"
            >
              <CheckCircle className="w-16 h-16 text-secondary mx-auto mb-6" />
              
              {/* Booking Details */}
              <div className="bg-background-secondary rounded-2xl p-6 mb-8 text-left">
                <h3 className="font-bold text-lg text-center mb-4 text-primary">Ders hakkında bilgi</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ebeveyn:</span>
                    <span className="font-medium">{bookingData.parentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefon:</span>
                    <span className="font-medium">{bookingData.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Eposta:</span>
                    <span className="font-medium">{bookingData.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Çocuk:</span>
                    <span className="font-medium">{bookingData.childName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Yaş:</span>
                    <span className="font-medium">{bookingData.childAge}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tarih ve saat:</span>
                    <span className="font-medium">
                      {bookingData.selectedDate && format(bookingData.selectedDate, 'dd MMMM yyyy', { locale: tr })} {bookingData.selectedTime}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground"
                  size="lg"
                  onClick={resetModal}
                >
                  Yeni ders ekle
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Progress Bar */}
              <div className="flex items-center justify-center space-x-4 mb-8">
                {[1, 2, 3].map((num) => (
                  <div key={num} className="flex items-center">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors",
                      step >= num ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {num}
                    </div>
                    {num < 3 && (
                      <div className={cn(
                        "w-12 h-1 mx-2 transition-colors",
                        step > num ? "bg-secondary" : "bg-muted"
                      )} />
                    )}
                  </div>
                ))}
              </div>

              {/* Step 1: Parent Info */}
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-foreground mb-2">Veli Bilgileri</h3>
                    <p className="text-muted-foreground">İletişim kurabilmemiz için bilgilerinizi paylaşın</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="parentName" className="flex items-center mb-2">
                        <User className="w-4 h-4 mr-2 text-primary" />
                        Veli Adı Soyadı
                      </Label>
                      <Input
                        id="parentName"
                        value={bookingData.parentName}
                        onChange={(e) => handleInputChange('parentName', e.target.value)}
                        placeholder="Adınız ve soyadınız"
                        className={cn("h-12", validationErrors.parentName && "border-destructive")}
                      />
                      {validationErrors.parentName && (
                        <p className="text-sm text-destructive mt-1">{validationErrors.parentName}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="phone" className="flex items-center mb-2">
                        <Phone className="w-4 h-4 mr-2 text-primary" />
                        Telefon Numarası
                      </Label>
                      <Input
                        id="phone"
                        value={bookingData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+90 5xx xxx xx xx"
                        className={cn("h-12", validationErrors.phone && "border-destructive")}
                      />
                      {validationErrors.phone && (
                        <p className="text-sm text-destructive mt-1">{validationErrors.phone}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="email" className="flex items-center mb-2">
                        <Mail className="w-4 h-4 mr-2 text-primary" />
                        E-posta Adresi
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={bookingData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="ornek@email.com"
                        className={cn("h-12", validationErrors.email && "border-destructive")}
                      />
                      {validationErrors.email && (
                        <p className="text-sm text-destructive mt-1">{validationErrors.email}</p>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={() => handleNextStep(1)}
                    className="w-full bg-primary hover:bg-primary-hover text-primary-foreground"
                    size="lg"
                  >
                    Devam Et
                  </Button>
                </motion.div>
              )}

              {/* Step 2: Child Info */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-foreground mb-2">Çocuk Bilgileri</h3>
                    <p className="text-muted-foreground">Çocuğunuzun yaşına uygun program hazırlayalım</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="childName" className="flex items-center mb-2">
                        <Baby className="w-4 h-4 mr-2 text-primary" />
                        Çocuğun Adı
                      </Label>
                      <Input
                        id="childName"
                        value={bookingData.childName}
                        onChange={(e) => handleInputChange('childName', e.target.value)}
                        placeholder="Çocuğunuzun adı"
                        className={cn("h-12", validationErrors.childName && "border-destructive")}
                      />
                      {validationErrors.childName && (
                        <p className="text-sm text-destructive mt-1">{validationErrors.childName}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Lütfen çocuğunuzun tam adını ve soyadını doğru olarak giriniz. Sizin iletişiğiniz şekilde de sertifikasında görünecektir. Teşekkür ederiz!
                      </p>
                    </div>

                    <div>
                      <Label className="flex items-center mb-4">
                        <Baby className="w-4 h-4 mr-2 text-primary" />
                        Çocuğunuzun yaşını seçin
                      </Label>
                      <div className="grid grid-cols-4 gap-3">
                        {ageOptions.map((age) => (
                          <button
                            key={age.value}
                            disabled={age.disabled}
                            onClick={() => !age.disabled && handleInputChange('childAge', age.value)}
                            className={cn(
                              "h-12 rounded-lg border-2 font-medium transition-all",
                              age.disabled 
                                ? "border-muted bg-muted text-muted-foreground cursor-not-allowed"
                                : bookingData.childAge === age.value
                                  ? "border-secondary bg-secondary text-secondary-foreground"
                                  : "border-border hover:border-secondary hover:bg-secondary/10"
                            )}
                          >
                            {age.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-4">
                    <Button 
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="flex-1"
                      size="lg"
                    >
                      Geri
                    </Button>
                    <Button 
                      onClick={() => handleNextStep(2)}
                      className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground"
                      size="lg"
                    >
                      Devam Et
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Date & Time */}
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-foreground mb-2">Tarih ve Saat Seçimi</h3>
                    <p className="text-muted-foreground">Uygun tarih ve saati seçin</p>
                  </div>

                  <div className="space-y-6">
                    {/* Date Selection */}
                    <div>
                      <Label className="mb-4 block">
                        Uygun saat aralıkları: {bookingData.selectedDate && format(bookingData.selectedDate, 'dd MMMM, EEEE', { locale: tr })}
                      </Label>
                      
                      <div className="flex justify-center mb-6">
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full max-w-md justify-start text-left font-normal h-12",
                                !bookingData.selectedDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {bookingData.selectedDate ? (
                                format(bookingData.selectedDate, 'dd MMMM yyyy', { locale: tr })
                              ) : (
                                <span>Tarih seçin</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white border shadow-lg" align="start">
                            <Calendar
                              mode="single"
                              selected={bookingData.selectedDate || undefined}
                              onSelect={(date) => handleInputChange('selectedDate', date)}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                return date.getTime() < today.getTime();
                              }} // Sadece geçmiş tarihleri disable et
                              initialFocus
                              locale={tr}
                              className="p-3 pointer-events-auto bg-white"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Time Selection */}
                    {bookingData.selectedDate && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <button
                            onClick={goToPreviousDay}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                            disabled={bookingData.selectedDate && (() => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return bookingData.selectedDate!.getTime() <= today.getTime();
                            })()}
                          >
                            ← Önceki gün
                          </button>
                          <button
                            onClick={goToNextDay}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            Sonraki gün →
                          </button>
                        </div>
                        
                        <div className={cn(
                          "grid gap-3",
                          getTimeSlots(bookingData.selectedDate).length > 8 ? "grid-cols-6" : "grid-cols-4"
                        )}>
                          {getTimeSlots(bookingData.selectedDate).map((time) => (
                            <button
                              key={time}
                              onClick={() => handleInputChange('selectedTime', time)}
                              className={cn(
                                "h-12 rounded-lg border-2 font-medium transition-all flex items-center justify-center",
                                bookingData.selectedTime === time
                                  ? "border-secondary bg-secondary text-secondary-foreground"
                                  : "border-border hover:border-secondary hover:bg-secondary/10"
                              )}
                            >
                              {time}
                            </button>
                          ))}
                        </div>

                        <div className="text-center mt-4 space-y-2">
                          <div className="text-sm text-muted-foreground">
                            <span>Saat diliminde gösterilen saatler: </span>
                            <Badge variant="outline" className="text-xs">
                              (UTC +03:00) Europe/Istanbul
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Saat diliminde gösterilen saatler, geçerli saat{' '}
                            <strong>{new Date().toLocaleTimeString('tr-TR')}</strong>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Deneme dersi için başlangıç için ebeveyn olarak eşlik etmeniz gerektiğini lütfen unutmayın, aksi takdirde deneme dersi yapılamayacaktır
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="flex space-x-4">
                    <Button 
                      variant="outline"
                      onClick={() => setStep(2)}
                      className="flex-1"
                      size="lg"
                    >
                      Geri
                    </Button>
                    <Button 
                      onClick={handleSubmit}
                      disabled={!isStep3Valid || isSubmitting}
                      className="flex-1 bg-accent text-accent-foreground hover:bg-accent-hover"
                      size="lg"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent-foreground mr-2"></div>
                          İşleniyor...
                        </div>
                      ) : (
                        'Ders al'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};