import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';

export const useAttestationEncoding = () => {
  const encodeEventAttendanceData = (
    eventId: string,
    lockAddress: string,
    eventTitle: string,
    timestamp: number = Math.floor(Date.now() / 1000),
    location: string = 'Metaverse',
    platform: string = 'TeeRex'
  ): string => {
    const schema = 'string eventId,address lockAddress,string eventTitle,uint256 timestamp,string location,string platform';
    const encoder = new SchemaEncoder(schema);
    return encoder.encodeData([
      { name: 'eventId', type: 'string', value: eventId },
      { name: 'lockAddress', type: 'address', value: lockAddress },
      { name: 'eventTitle', type: 'string', value: eventTitle },
      { name: 'timestamp', type: 'uint256', value: BigInt(timestamp) },
      { name: 'location', type: 'string', value: location },
      { name: 'platform', type: 'string', value: platform },
    ]);
  };

  return {
    encodeEventAttendanceData,
    encodeEventLikeData: (
      eventId: string,
      lockAddress: string,
      eventTitle: string,
      rating: number,
      ticketHolder: string,
    ): string => {
      const schema = 'string eventId,string lockAddress,string eventTitle,uint8 rating,address ticketHolder';
      const encoder = new SchemaEncoder(schema);
      return encoder.encodeData([
        { name: 'eventId', type: 'string', value: eventId },
        { name: 'lockAddress', type: 'string', value: lockAddress },
        { name: 'eventTitle', type: 'string', value: eventTitle },
        { name: 'rating', type: 'uint8', value: rating },
        { name: 'ticketHolder', type: 'address', value: ticketHolder },
      ]);
    }
  };
};
