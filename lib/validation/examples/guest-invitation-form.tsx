// ============================================================================
// Guest Invitation Form Implementation Example
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, JSX, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useFormValidation, useFieldValidation } from "../hooks.ts";
import { guestInvitationSchema } from "../schemas.ts";
import type { GuestInvitationData } from "../schemas.ts";

/**
 * Complete guest invitation form implementation with validation
 * Demonstrates:
 * - Room selection with async loading
 * - Email validation with async uniqueness check
 * - Custom message validation
 * - Real-time room capacity checking
 * - Invitation preview
 * - Bulk invitation support
 * - Accessibility features
 */
export function GuestInvitationForm(): JSX.Element {
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [invitationSent, setInvitationSent] = useState(false);
  const [invitationPreview, setInvitationPreview] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEmails, setBulkEmails] = useState<string[]>(['']);

  // Initialize form validation with schema
  const form = useFormValidation<GuestInvitationData>(
    guestInvitationSchema,
    {
      roomId: '',
      guestEmail: '',
      guestName: '',
      customMessage: '',
      expiresInHours: 24
    }
  );

  // Separate validation for bulk emails
  const bulkEmailValidation = useFieldValidation([
    { type: 'email' }
  ]);

  // Load available rooms on component mount
  useEffect(() => {
    loadAvailableRooms();
  }, []);

  const loadAvailableRooms = async () => {
    try {
      setLoadingRooms(true);
      
      // Simulate API call to get active rooms
      const response = await fetch('/api/rooms/active');
      const rooms = await response.json();
      
      setAvailableRooms(rooms.data || []);
    } catch (error) {
      console.error('Failed to load rooms:', error);
      form.setSubmissionError('Failed to load available rooms. Please refresh the page.');
    } finally {
      setLoadingRooms(false);
    }
  };

  // Handle room selection
  const handleRoomSelect = (roomId: string) => {
    form.setFieldValue('roomId', roomId);
    const room = availableRooms.find(r => r.id === roomId);
    setSelectedRoom(room);
  };

  // Handle successful form submission
  const handleSubmit = async (data: GuestInvitationData) => {
    try {
      console.log('Sending invitation:', data);
      
      const invitationData = bulkMode 
        ? {
            ...data,
            guestEmails: bulkEmails.filter(email => email.trim())
          }
        : data;

      const response = await fetch('/api/guests/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invitationData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Invitation sent:', result);
        setInvitationSent(true);
        form.reset();
        setSelectedRoom(null);
        setBulkEmails(['']);
      } else {
        const errorData = await response.json();
        
        if (errorData.errors) {
          form.setServerErrors(errorData.errors);
        } else {
          form.setSubmissionError('Failed to send invitation. Please try again.');
        }
      }
    } catch (error) {
      console.error('Invitation error:', error);
      form.setSubmissionError('Network error. Please check your connection and try again.');
    }
  };

  // Add bulk email field
  const addBulkEmail = () => {
    setBulkEmails([...bulkEmails, '']);
  };

  // Remove bulk email field
  const removeBulkEmail = (index: number) => {
    setBulkEmails(bulkEmails.filter((_, i) => i !== index));
  };

  // Update bulk email
  const updateBulkEmail = (index: number, email: string) => {
    const newEmails = [...bulkEmails];
    newEmails[index] = email;
    setBulkEmails(newEmails);
  };

  // Generate invitation preview
  const generateInvitationPreview = () => {
    const roomName = selectedRoom?.name || 'Your Room';
    const guestName = form.getFieldValue('guestName') || 'Guest';
    const customMessage = form.getFieldValue('customMessage') || '';
    
    return {
      subject: `Invitation to join "${roomName}" on SimplyCaster`,
      body: `Hi ${guestName},

You've been invited to join a podcast recording session!

Room: ${roomName}
Host: ${selectedRoom?.hostName || 'Host'}
${customMessage ? `\nPersonal message:\n${customMessage}` : ''}

Click the link below to join:
[Join Room Link]

This invitation expires in ${form.getFieldValue('expiresInHours')} hours.

Best regards,
SimplyCaster Team`
    };
  };

  if (invitationSent) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md text-center">
        <div className="mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invitation Sent!</h2>
          <p className="text-gray-600 mb-6">
            {bulkMode 
              ? `Invitations have been sent to ${bulkEmails.filter(e => e.trim()).length} guests.`
              : 'The invitation has been sent to the guest.'
            } They will receive an email with instructions to join the room.
          </p>
          <button
            onClick={() => setInvitationSent(false)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Send Another Invitation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Invite Guest to Room</h2>
        <p className="text-gray-600">Send an invitation to join a podcast recording session</p>
      </div>

      {/* Bulk Mode Toggle */}
      <div className="mb-6 flex items-center">
        <input
          id="bulkMode"
          type="checkbox"
          checked={bulkMode}
          onChange={(e) => setBulkMode((e.target as HTMLInputElement).checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="bulkMode" className="ml-2 block text-sm text-gray-700">
          Invite multiple guests at once
        </label>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submitForm(handleSubmit);
        }}
        className="space-y-6"
        noValidate
        aria-label="Guest invitation form"
      >
        {/* Room Selection */}
        <div className="field-group">
          <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 mb-1">
            Select Room
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          
          {loadingRooms ? (
            <div className="flex items-center justify-center py-4 border border-gray-300 rounded-md">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-gray-600">Loading rooms...</span>
            </div>
          ) : (
            <select
              id="roomId"
              value={form.getFieldValue('roomId') || ''}
              onChange={(e) => handleRoomSelect((e.target as HTMLSelectElement).value)}
              onBlur={() => form.touchField('roomId')}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                form.hasFieldError('roomId') && form.isFieldTouched('roomId')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              aria-invalid={form.hasFieldError('roomId')}
              aria-describedby={form.hasFieldError('roomId') ? 'roomId-error' : 'roomId-help'}
              aria-required="true"
            >
              <option value="">Choose a room...</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.activeGuests}/{room.maxParticipants} guests)
                </option>
              ))}
            </select>
          )}
          
          <div id="roomId-help" className="text-xs text-gray-500 mt-1">
            Select which room the guest will join
          </div>
          
          {form.hasFieldError('roomId') && form.isFieldTouched('roomId') && (
            <div id="roomId-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('roomId')}
            </div>
          )}
        </div>

        {/* Room Info Display */}
        {selectedRoom && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-2">Room Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-700">Name:</span>
                <span className="ml-1 text-blue-900">{selectedRoom.name}</span>
              </div>
              <div>
                <span className="font-medium text-blue-700">Host:</span>
                <span className="ml-1 text-blue-900">{selectedRoom.hostName}</span>
              </div>
              <div>
                <span className="font-medium text-blue-700">Status:</span>
                <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                  selectedRoom.status === 'active' 
                    ? 'bg-green-100 text-green-800'
                    : selectedRoom.status === 'recording'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {selectedRoom.status}
                </span>
              </div>
              <div>
                <span className="font-medium text-blue-700">Capacity:</span>
                <span className="ml-1 text-blue-900">
                  {selectedRoom.activeGuests}/{selectedRoom.maxParticipants}
                </span>
              </div>
            </div>
            
            {selectedRoom.activeGuests >= selectedRoom.maxParticipants && (
              <div className="mt-2 text-sm text-red-600 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Room is at full capacity. Guest will be added to waiting list.
              </div>
            )}
          </div>
        )}

        {/* Guest Email(s) */}
        {bulkMode ? (
          <div className="field-group">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Guest Email Addresses
              <span className="text-red-500 ml-1" aria-label="required">*</span>
            </label>
            
            {bulkEmails.map((email, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateBulkEmail(index, (e.target as HTMLInputElement).value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Guest ${index + 1} email address`}
                  aria-label={`Guest ${index + 1} email address`}
                />
                {bulkEmails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBulkEmail(index)}
                    className="p-2 text-red-600 hover:text-red-800"
                    aria-label={`Remove guest ${index + 1} email`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            
            <button
              type="button"
              onClick={addBulkEmail}
              className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add another email
            </button>
          </div>
        ) : (
          <div className="field-group">
            <label htmlFor="guestEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Guest Email Address
              <span className="text-red-500 ml-1" aria-label="required">*</span>
            </label>
            <div className="relative">
              <input
                id="guestEmail"
                type="email"
                value={form.getFieldValue('guestEmail') || ''}
                onChange={(e) => form.setFieldValue('guestEmail', (e.target as HTMLInputElement).value)}
                onBlur={() => form.touchField('guestEmail')}
                className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                  form.hasFieldError('guestEmail') && form.isFieldTouched('guestEmail')
                    ? 'border-red-500 focus:ring-red-500'
                    : form.isFieldValidating('guestEmail')
                    ? 'border-yellow-500 focus:ring-yellow-500'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
                placeholder="Enter guest's email address"
                aria-invalid={form.hasFieldError('guestEmail')}
                aria-describedby={form.hasFieldError('guestEmail') ? 'guestEmail-error' : 'guestEmail-help'}
                aria-required="true"
                disabled={form.isFieldValidating('guestEmail')}
              />
              {form.isFieldValidating('guestEmail') && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
                </div>
              )}
            </div>
            <div id="guestEmail-help" className="text-xs text-gray-500 mt-1">
              The guest will receive an invitation email at this address
            </div>
            {form.isFieldValidating('guestEmail') && (
              <div className="text-yellow-600 text-sm mt-1 flex items-center" aria-live="polite">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-600 mr-2"></div>
                Validating email address...
              </div>
            )}
            {form.hasFieldError('guestEmail') && form.isFieldTouched('guestEmail') && (
              <div id="guestEmail-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {form.getFieldError('guestEmail')}
              </div>
            )}
          </div>
        )}

        {/* Guest Name */}
        {!bulkMode && (
          <div className="field-group">
            <label htmlFor="guestName" className="block text-sm font-medium text-gray-700 mb-1">
              Guest Name
            </label>
            <input
              id="guestName"
              type="text"
              value={form.getFieldValue('guestName') || ''}
              onChange={(e) => form.setFieldValue('guestName', (e.target as HTMLInputElement).value)}
              onBlur={() => form.touchField('guestName')}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                form.hasFieldError('guestName') && form.isFieldTouched('guestName')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Enter guest's name (optional)"
              aria-invalid={form.hasFieldError('guestName')}
              aria-describedby={form.hasFieldError('guestName') ? 'guestName-error' : 'guestName-help'}
            />
            <div id="guestName-help" className="text-xs text-gray-500 mt-1">
              Optional name to personalize the invitation
            </div>
            {form.hasFieldError('guestName') && form.isFieldTouched('guestName') && (
              <div id="guestName-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {form.getFieldError('guestName')}
              </div>
            )}
          </div>
        )}

        {/* Custom Message */}
        <div className="field-group">
          <label htmlFor="customMessage" className="block text-sm font-medium text-gray-700 mb-1">
            Personal Message
          </label>
          <textarea
            id="customMessage"
            rows={3}
            value={form.getFieldValue('customMessage') || ''}
            onChange={(e) => form.setFieldValue('customMessage', (e.target as HTMLTextAreaElement).value)}
            onBlur={() => form.touchField('customMessage')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors resize-vertical ${
              form.hasFieldError('customMessage') && form.isFieldTouched('customMessage')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="Add a personal message to the invitation (optional)"
            aria-invalid={form.hasFieldError('customMessage')}
            aria-describedby={form.hasFieldError('customMessage') ? 'customMessage-error' : 'customMessage-help'}
          />
          <div id="customMessage-help" className="text-xs text-gray-500 mt-1 flex justify-between">
            <span>Optional personal message to include in the invitation</span>
            <span>{(form.getFieldValue('customMessage') || '').length}/500</span>
          </div>
          {form.hasFieldError('customMessage') && form.isFieldTouched('customMessage') && (
            <div id="customMessage-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('customMessage')}
            </div>
          )}
        </div>

        {/* Expiration Time */}
        <div className="field-group">
          <label htmlFor="expiresInHours" className="block text-sm font-medium text-gray-700 mb-1">
            Invitation Expires In
          </label>
          <select
            id="expiresInHours"
            value={form.getFieldValue('expiresInHours') || 24}
            onChange={(e) => form.setFieldValue('expiresInHours', parseInt((e.target as HTMLSelectElement).value))}
            onBlur={() => form.touchField('expiresInHours')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
              form.hasFieldError('expiresInHours') && form.isFieldTouched('expiresInHours')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            aria-invalid={form.hasFieldError('expiresInHours')}
            aria-describedby={form.hasFieldError('expiresInHours') ? 'expiresInHours-error' : 'expiresInHours-help'}
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours (1 day)</option>
            <option value={48}>48 hours (2 days)</option>
            <option value={72}>72 hours (3 days)</option>
            <option value={168}>1 week</option>
          </select>
          <div id="expiresInHours-help" className="text-xs text-gray-500 mt-1">
            How long the invitation link will remain valid
          </div>
          {form.hasFieldError('expiresInHours') && form.isFieldTouched('expiresInHours') && (
            <div id="expiresInHours-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('expiresInHours')}
            </div>
          )}
        </div>

        {/* Invitation Preview */}
        {!bulkMode && selectedRoom && form.getFieldValue('guestEmail') && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Invitation Preview</h3>
              <button
                type="button"
                onClick={() => setInvitationPreview(!invitationPreview)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                {invitationPreview ? 'Hide' : 'Show'} Preview
              </button>
            </div>
            
            {invitationPreview && (
              <div className="border border-gray-200 rounded bg-white p-3 text-sm">
                <div className="font-medium text-gray-900 mb-2">
                  Subject: {generateInvitationPreview().subject}
                </div>
                <div className="text-gray-700 whitespace-pre-line">
                  {generateInvitationPreview().body}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form-level errors */}
        {form.hasSubmissionError() && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3" role="alert">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-red-800 text-sm">
                {form.getSubmissionError()}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            type="submit"
            disabled={!form.isValid || form.isSubmitting}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !form.isValid || form.isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {form.isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending Invitation...
              </div>
            ) : (
              `Send ${bulkMode ? 'Invitations' : 'Invitation'}`
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              form.reset();
              setSelectedRoom(null);
              setBulkEmails(['']);
              setInvitationPreview(false);
            }}
            className="px-6 py-3 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

export default GuestInvitationForm;