import mitt from 'mitt';

type Events = {
  'initiate-call': { phoneNumber: string; contactInfo?: { id?: string; name?: string } };
  // Add other app-wide events here if needed
};

const emitter = mitt<Events>();

export default emitter; 