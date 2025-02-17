import { Injectable, Injector } from '@angular/core';
import { OnlineUser } from '@core/domain-classes/online-user';
import { SecurityService } from '@core/security/security.service';
import { environment } from '@environments/environment';
import * as signalR from '@microsoft/signalr';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ClonerService } from './clone.service';
import { TranslationService } from './translation.service';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  private hubConnection: signalR.HubConnection;
  private onlineUsers_key: string = 'onlineuser_key';
  private _onlineUsers: BehaviorSubject<OnlineUser[]> = new BehaviorSubject<OnlineUser[]>([]);
  private _userNotification$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private _securityService: SecurityService | undefined;

  public get userNotification$(): Observable<string> {
    return this._userNotification$.asObservable();
  }

  public get onlineUsers$(): Observable<OnlineUser[]> {
    return this._onlineUsers.asObservable();
  }

  public get connectionId(): string {
    return this.hubConnection?.connectionId || '';
  }

  constructor(
    private clonerService: ClonerService,
    private toastrService: ToastrService,
    public translationService: TranslationService,
    private injector: Injector,
    private http: HttpClient
  ) {
    this.startConnection()
      .then(() => {
        this.handleMessage(); // Start listening to SignalR events
        this.fetchInitialOnlineUsers(); // Fetch initial online users
      })
      .catch(err => console.error('Error initializing SignalR connection:', err));
  }

  public startConnection(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(`${environment.apiUrl}userHub`)
        .build();
      this.hubConnection
        .start()
        .then(() => {
          console.log('SignalR Connection started successfully');
          resolve(true);
        })
        .catch(err => {
          console.error('Error starting SignalR connection:', err);
          reject(false);
        });
    });
  }

  public handleMessage() {
    this.hubConnection.on('userLeft', (id: string) => {
      this.removeUser(id);
    });

    this.hubConnection.on('newOnlineUser', (onlineUser: OnlineUser) => {
      this.newOnlineUser(onlineUser);
    });

    this.hubConnection.on('sendNotification', (userId: string) => {
      this._userNotification$.next(userId);
    });

    this.hubConnection.on('Joined', (onlineUser: OnlineUser) => {
      // Handle user join
    });

    this.hubConnection.on('logout', (onlineUser: OnlineUser) => {
      this.removeUser(onlineUser.id);
    });

    this.hubConnection.on('forceLogout', (onlineUser: OnlineUser) => {
      this.removeUser(onlineUser.id);
      this.toastrService.error(this.translationService.getValue('ADMIN_LOGOUT_YOU_FORCEFULLY.'));
      this.securityService.logout();
    });

    this.hubConnection.on('onlineUsers', (onlineUsers: OnlineUser[]) => {
      console.log('Online users received from SignalR:', onlineUsers);
      if (onlineUsers.length > 0) {
        const onlineUsersStr = JSON.stringify(onlineUsers);
        localStorage.setItem(this.onlineUsers_key, onlineUsersStr);
        this._onlineUsers.next(onlineUsers);
      } else {
        localStorage.removeItem(this.onlineUsers_key);
        this._onlineUsers.next([]);
      }
    });

    this.hubConnection.on('sendDM', (message: string, sender: OnlineUser[]) => {
      // Handle direct messages
    });
  }

  private fetchInitialOnlineUsers() {
    this.http.get<OnlineUser[]>('api/onlineUsers').subscribe(
      users => {
        console.log('Fetched online users:', users);
        this._onlineUsers.next(users); 
      },
      error => {
        console.error('Error fetching online users:', error);
      }
    );
  }

  private get securityService(): SecurityService {
    if (!this._securityService) {
      this._securityService = this.injector.get(SecurityService);
    }
    return this._securityService;
  }

  addUser(signalrUser: OnlineUser) {
    this.hubConnection.invoke('join', signalrUser)
      .catch(err => console.error('Error adding user:', err));
  }

  forceLogout(id: string) {
    this.hubConnection.invoke('forceLogout', id)
      .catch(err => console.error('Error forcing logout:', err));
  }

  logout(id: string) {
    localStorage.removeItem(this.onlineUsers_key);
    this._onlineUsers.next([]);
    this.hubConnection.invoke('logout', id)
      .catch(err => console.error('Error logging out:', err));
  }

  newOnlineUser(onlineUser: OnlineUser): void {
    const onlineUsersStr = localStorage.getItem(this.onlineUsers_key);
    let onlineUsers = onlineUsersStr ? JSON.parse(onlineUsersStr) as OnlineUser[] : [];
    if (!onlineUsers.find(c => c.id === onlineUser.id)) {
      onlineUsers.push(onlineUser);
      this._onlineUsers.next(onlineUsers);
    }
  }

  removeUser(id: string) {
    const onlineUsersStr = localStorage.getItem(this.onlineUsers_key);
    if (onlineUsersStr) {
      let onlineUsers = JSON.parse(onlineUsersStr) as OnlineUser[];
      onlineUsers = onlineUsers.filter(c => c.id !== id);
      if (onlineUsers.length > 0) {
        localStorage.setItem(this.onlineUsers_key, JSON.stringify(onlineUsers));
      } else {
        localStorage.removeItem(this.onlineUsers_key);
      }
      this._onlineUsers.next(onlineUsers);
    }
  }
}
